/* ===========================================================================
   Fond animé 3D « armoire électrique » (Three.js + GSAP) pour l'onglet SMATI.
   Adapté de l'animation fournie, sans l'interface d'origine : la scène
   (structure, platine, variateur, sectionneur, automate, câblage) se
   monte en boucle derrière la page, aux couleurs rouge/orange SMATI.

   API : window.SmatiBg.start() / window.SmatiBg.stop()
   Les bibliothèques (three.js r128, GSAP 3.12.2) sont hébergées dans
   /vendor et ne sont chargées qu'au premier affichage de l'onglet.
   =========================================================================== */
(function () {
  "use strict";

  const LOGO_TEXT = "SMATI";
  let loadPromise = null;
  let ready = false;
  let running = false;
  let rafId = null;

  let container, scene, camera, renderer, root;
  let plateGroup, componentsGroup, wiresGroup, cabinetGroup;
  let timeline = null;
  const pulseParticles = [];
  const networkLeds = [];
  let currentStep = 1;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error("Chargement impossible : " + src));
      document.head.appendChild(s);
    });
  }

  function ensureLibs() {
    if (!loadPromise) {
      loadPromise = loadScript("vendor/three.r128.min.js")
        .then(() => loadScript("vendor/gsap.3.12.2.min.js"));
    }
    return loadPromise;
  }

  function hasWebGL() {
    try {
      const c = document.createElement("canvas");
      return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl")));
    } catch (e) {
      return false;
    }
  }

  /* ------------------------------------------------------------------ */
  function createLogoTexture(text, width, height, metallic) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (metallic) {
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, "#3b2a2a");
      grad.addColorStop(0.5, "#8a7a78");
      grad.addColorStop(1, "#2a1d1d");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = "#f97316";
      ctx.lineWidth = 6;
      ctx.strokeRect(6, 6, width - 12, height - 12);
    } else {
      ctx.fillStyle = "rgba(30, 18, 18, 0.92)";
      ctx.fillRect(0, 0, width, height);
    }
    ctx.fillStyle = metallic ? "#fff7ed" : "#fb923c";
    ctx.font = (metallic ? "bold 56px" : "bold 28px") + " Inter, 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text.toUpperCase(), width / 2, height / 2);
    return new THREE.CanvasTexture(canvas);
  }

  function buildCabinet() {
    const width = 12.0, height = 18.0, depth = 4.0;

    const frameMat = new THREE.MeshStandardMaterial({ color: 0x4a4348, roughness: 0.3, metalness: 0.8 });
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x2b2427, roughness: 0.5, metalness: 0.9 });
    const plateMat = new THREE.MeshStandardMaterial({ color: 0xa7a09d, roughness: 0.2, metalness: 0.85 });

    const plinth = new THREE.Mesh(new THREE.BoxGeometry(width + 0.4, 1.0, depth + 0.4), baseMat);
    plinth.position.set(0, -height / 2 - 0.5, 0);
    cabinetGroup.add(plinth);

    const back = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.1), frameMat);
    back.position.set(0, 0, -depth / 2);
    cabinetGroup.add(back);

    [-width / 2, width / 2].forEach(x => {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.1, height, depth), frameMat);
      side.position.set(x, 0, 0);
      cabinetGroup.add(side);
    });
    [-height / 2, height / 2].forEach(y => {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(width, 0.1, depth), frameMat);
      cap.position.set(0, y, 0);
      cabinetGroup.add(cap);
    });

    const plate = new THREE.Mesh(new THREE.BoxGeometry(width - 0.8, height - 1.2, 0.2), plateMat);
    plate.position.set(0, 0, -depth / 2 + 0.4);
    plateGroup.add(plate);

    const badge = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.6, 0.08),
      new THREE.MeshStandardMaterial({ map: createLogoTexture(LOGO_TEXT, 512, 128, true), roughness: 0.2, metalness: 0.7 })
    );
    badge.position.set(3.8, 7.8, -depth / 2 + 0.6);
    plateGroup.add(badge);

    const earthBar = new THREE.Mesh(
      new THREE.BoxGeometry(10.0, 0.3, 0.15),
      new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.9 })
    );
    earthBar.position.set(0, -7.8, -depth / 2 + 0.65);
    plateGroup.add(earthBar);

    const ductPvcMat = new THREE.MeshStandardMaterial({ color: 0x3a3234, roughness: 0.6, metalness: 0.1 });
    const ductCoverMat = new THREE.MeshStandardMaterial({
      color: 0x6b5f60, roughness: 0.4, metalness: 0.2, transparent: true, opacity: 0.4,
    });

    function slottedDuct(dW, dH, dD, x, y, vertical) {
      const g = new THREE.Group();
      g.position.set(x, y, -depth / 2 + 0.9);
      g.add(new THREE.Mesh(new THREE.BoxGeometry(dW, dH, 0.1), ductPvcMat));
      const finger = 0.18, gap = 0.28, slotDepth = dD - 0.1;
      if (vertical) {
        const count = Math.floor(dH / (finger + gap));
        for (let i = -count / 2; i < count / 2; i++) {
          const fy = i * (finger + gap);
          [-1, 1].forEach(sgn => {
            const f = new THREE.Mesh(new THREE.BoxGeometry(0.1, finger, slotDepth), ductPvcMat);
            f.position.set(sgn * (dW / 2 - 0.05), fy, slotDepth / 2);
            g.add(f);
          });
        }
      } else {
        const count = Math.floor(dW / (finger + gap));
        for (let i = -count / 2; i < count / 2; i++) {
          const fx = i * (finger + gap);
          [-1, 1].forEach(sgn => {
            const f = new THREE.Mesh(new THREE.BoxGeometry(finger, 0.1, slotDepth), ductPvcMat);
            f.position.set(fx, sgn * (dH / 2 - 0.05), slotDepth / 2);
            g.add(f);
          });
        }
      }
      const cover = new THREE.Mesh(new THREE.BoxGeometry(dW + 0.1, dH + 0.1, 0.12), ductCoverMat);
      cover.position.set(0, 0, dD);
      g.add(cover);
      plateGroup.add(g);
    }
    slottedDuct(1.0, 16.0, 1.0, -5.0, 0, true);
    slottedDuct(1.0, 16.0, 1.0, 5.0, 0, true);
    slottedDuct(1.0, 16.0, 1.0, 0.0, 0, true);
    slottedDuct(9.0, 1.0, 1.0, 0, 7.5, false);
    slottedDuct(9.0, 1.0, 1.0, 0, 1.5, false);
    slottedDuct(9.0, 1.0, 1.0, 0, -4.5, false);
    slottedDuct(9.0, 1.0, 1.0, 0, -7.5, false);

    const dinMat = new THREE.MeshStandardMaterial({ color: 0xe7e5e4, metalness: 0.95, roughness: 0.15 });
    [4.5, -1.5].forEach(y => {
      [2.5, -2.5].forEach(x => {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.55, 0.2), dinMat);
        rail.position.set(x, y, -depth / 2 + 0.8);
        plateGroup.add(rail);
      });
    });
  }

  function buildComponents() {
    const bodyWhite = new THREE.MeshStandardMaterial({ color: 0xf5f5f4, roughness: 0.35 });
    const bodyDark = new THREE.MeshStandardMaterial({ color: 0x2a2224, roughness: 0.4 });
    const bodyPlcGrey = new THREE.MeshStandardMaterial({ color: 0x57494a, roughness: 0.3 });
    const bodyBlack = new THREE.MeshStandardMaterial({ color: 0x1c1517, roughness: 0.3 });
    const bodySwitchMetal = new THREE.MeshStandardMaterial({ color: 0x78686a, metalness: 0.8, roughness: 0.2 });
    const bodyVfdRed = new THREE.MeshStandardMaterial({ color: 0xc1121f, roughness: 0.3 });
    const heatsink = new THREE.MeshStandardMaterial({ color: 0x8a7f80, metalness: 0.9, roughness: 0.2 });
    const orange = new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.2 });
    const yellow = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.2 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.9, roughness: 0.2 });
    const ledRun = new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 0.9 });
    const ledErr = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 0.2 });
    const ledNet = new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xf59e0b, emissiveIntensity: 0.9 });

    function createVFD() {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.BoxGeometry(3.2, 5.0, 2.2), bodyVfdRed));
      for (let fin = -1.3; fin <= 1.3; fin += 0.25) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 4.8, 0.8), heatsink);
        m.position.set(fin, 0, -1.2);
        g.add(m);
      }
      const frame = new THREE.Mesh(new THREE.BoxGeometry(2.8, 4.6, 0.3), bodyDark);
      frame.position.set(0, 0, 1.15);
      g.add(frame);
      const lcd = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 0.9, 0.1),
        new THREE.MeshStandardMaterial({ color: 0x7c2d12, emissive: 0xf97316, emissiveIntensity: 0.6 })
      );
      lcd.position.set(0, 1.4, 1.3);
      g.add(lcd);
      const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.2, 16), bodyBlack);
      dial.rotation.x = Math.PI / 2;
      dial.position.set(-0.7, 0.4, 1.35);
      g.add(dial);
      const run = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, 0.1), ledRun);
      run.position.set(0.2, 0.4, 1.32);
      g.add(run);
      const stop = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, 0.1), ledErr);
      stop.position.set(0.7, 0.4, 1.32);
      g.add(stop);
      const term = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.6, 0.2), bodyBlack);
      term.position.set(0, -1.3, 1.25);
      g.add(term);
      for (let tx = -1.0; tx <= 1.0; tx += 0.4) {
        const t = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.35, 0.3), brass);
        t.position.set(tx, -2.1, 0.8);
        g.add(t);
      }
      return g;
    }

    function createMainSwitch() {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.BoxGeometry(2.8, 3.2, 1.8), bodyDark));
      const plate = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 0.1), yellow);
      plate.position.set(0, 0, 0.95);
      g.add(plate);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.3, 16), orange);
      base.rotation.x = Math.PI / 2;
      base.position.set(0, 0, 1.1);
      g.add(base);
      const lever = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.4, 0.35), orange);
      lever.position.set(0, 0.2, 1.3);
      lever.rotation.z = -0.4;
      g.add(lever);
      return g;
    }

    function createContactor() {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.2, 1.6), bodyWhite));
      const center = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 0.2), bodyVfdRed);
      center.position.set(0, 0.2, 0.85);
      g.add(center);
      const o = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.6, 1.5), bodyDark);
      o.position.set(0, -1.8, 0.05);
      g.add(o);
      const reset = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.15, 12), ledRun);
      reset.rotation.x = Math.PI / 2;
      reset.position.set(-0.4, -1.8, 0.8);
      g.add(reset);
      const stop = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.15, 12), ledErr);
      stop.rotation.x = Math.PI / 2;
      stop.position.set(0.4, -1.8, 0.8);
      g.add(stop);
      return g;
    }

    function createPLC() {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.4, 1.6), bodyPlcGrey));
      [0.85, -0.85].forEach(y => {
        const door = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.6, 0.2), bodyBlack);
        door.position.set(0, y, 0.82);
        g.add(door);
      });
      const logo = new THREE.Mesh(
        new THREE.PlaneGeometry(1.2, 0.35),
        new THREE.MeshBasicMaterial({ map: createLogoTexture(LOGO_TEXT, 256, 64, false), transparent: true })
      );
      logo.position.set(-1.0, 0.85, 0.93);
      g.add(logo);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.08, 0.07), new THREE.MeshStandardMaterial({ color: 0xf97316 }));
      strip.position.set(0, 0.38, 0.82);
      g.add(strip);
      for (let ix = -0.6; ix <= 1.4; ix += 0.2) {
        const a = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.02), ledNet.clone());
        a.position.set(ix, 0.2, 0.85);
        g.add(a);
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.02), ledRun.clone());
        b.position.set(ix, -0.2, 0.85);
        g.add(b);
        networkLeds.push(a, b);
      }
      return g;
    }

    function createSwitch() {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.4, 1.5), bodySwitchMetal));
      for (let p = 0; p < 5; p++) {
        const py = 0.5 - p * 0.38;
        const port = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.35), bodyBlack);
        port.position.set(0, py, 0.8);
        g.add(port);
        const led = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.02), ledRun.clone());
        led.position.set(-0.18, py + 0.1, 0.95);
        g.add(led);
        networkLeds.push(led);
      }
      return g;
    }

    const place = (obj, x, y, z) => { obj.position.set(x, y, z); componentsGroup.add(obj); };
    place(createVFD(), -2.5, 4.2, 0.2);
    place(createMainSwitch(), 2.5, 5.0, 0.0);
    place(createPLC(), -2.5, -1.5, 0.0);
    place(createSwitch(), 0.8, -1.5, 0.0);
    place(createContactor(), 2.8, -1.5, 0.0);
    place(createContactor(), 2.8, -6.0, 0.0);

    const termGrey = new THREE.MeshStandardMaterial({ color: 0x78686a });
    const termOrange = new THREE.MeshStandardMaterial({ color: 0xea580c });
    const termEarth = new THREE.MeshStandardMaterial({ color: 0xeab308 });
    for (let i = 0; i < 10; i++) {
      const mat = i === 0 ? termEarth : i % 2 === 0 ? termGrey : termOrange;
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.8, 1.3), mat);
      t.position.set(-3.8 + i * 0.38, -6.0, 0.0);
      componentsGroup.add(t);
    }
  }

  function buildWiring() {
    const matL1 = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.3 });
    const matL2 = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.3 });
    const matEth = new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.25, metalness: 0.1 });

    const connections = [
      { from: [2.5, 3.4, 0.8], into: [4.5, 3.4, 0.0], inside: [[4.5, 7.5, 0.0], [-0.5, 7.5, 0.0], [-0.5, 4.2, 0.0]],
        exit: [-1.2, 4.2, 0.0], to: [-1.5, 2.1, 0.8], mat: matL1, pulse: 0xef4444, r: 0.12 },
      { from: [2.5, 3.4, 0.8], into: [4.5, 3.4, 0.0], inside: [[4.5, -1.5, 0.0]],
        exit: [3.6, -1.5, 0.0], to: [2.8, -0.4, 0.8], mat: matL2, pulse: 0xf59e0b, r: 0.12 },
      { from: [-1.0, -2.3, 0.8], into: [0.0, -2.3, 0.0], inside: [[0.0, -1.5, 0.0]],
        exit: [0.8, -1.5, 0.0], to: [0.8, -1.0, 0.8], mat: matEth, pulse: 0x22c55e, r: 0.09 },
    ];

    connections.forEach(c => {
      const pts = [c.from, c.into, ...c.inside, c.exit, c.to].map(p => new THREE.Vector3(...p));
      const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.15);
      wiresGroup.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 60, c.r, 8, false), c.mat));
      const pulse = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), new THREE.MeshBasicMaterial({ color: c.pulse }));
      pulse.visible = false;
      root.add(pulse);
      pulseParticles.push({ mesh: pulse, curve, progress: Math.random() });
    });
  }

  function buildTimeline() {
    const camSteps = [
      { x: 0, y: 0, z: 28 },
      { x: 2.0, y: 1.5, z: 20 },
      { x: -1.0, y: -1.0, z: 18 },
    ];
    timeline = gsap.timeline({ repeat: -1, repeatDelay: 2 });

    plateGroup.position.set(0, 0, -25);
    plateGroup.rotation.y = Math.PI / 3;
    componentsGroup.children.forEach((c, i) => {
      c.position.z += 18 + i * 1.2;
      c.rotation.x = Math.PI;
      c.scale.set(0.001, 0.001, 0.001);
    });
    wiresGroup.children.forEach(w => w.scale.set(0, 0, 0));

    timeline
      .addLabel("step1").call(() => { currentStep = 1; pulseParticles.forEach(p => { p.mesh.visible = false; }); })
      .to(camera.position, { ...camSteps[0], duration: 1.5, ease: "power2.inOut" }, "step1")
      .to(plateGroup.position, { x: 0, y: 0, z: 0, duration: 2, ease: "back.out(1.1)" }, "step1")
      .to(plateGroup.rotation, { y: 0, duration: 2, ease: "power2.out" }, "step1")

      .addLabel("step2", "+=0.5").call(() => { currentStep = 2; })
      .to(camera.position, { ...camSteps[1], duration: 2, ease: "power2.inOut" }, "step2")
      .to(componentsGroup.children.map(c => c.scale), { x: 1, y: 1, z: 1, duration: 0.8, stagger: 0.08, ease: "back.out(1.4)" }, "step2")
      .to(componentsGroup.children.map(c => c.rotation), { x: 0, duration: 1, stagger: 0.08, ease: "power2.out" }, "step2")
      .to(componentsGroup.children.map(c => c.position), { z: 0.0, duration: 1.2, stagger: 0.08, ease: "bounce.out" }, "step2")

      .addLabel("step3", "+=0.5").call(() => { currentStep = 3; })
      .to(camera.position, { ...camSteps[2], duration: 2, ease: "power2.inOut" }, "step3")
      .to(wiresGroup.children.map(w => w.scale), { x: 1, y: 1, z: 1, duration: 1.8, stagger: 0.15, ease: "power3.out" }, "step3")
      .call(() => { pulseParticles.forEach(p => { p.mesh.visible = true; }); }, null, "step3");
  }

  function init() {
    container = document.getElementById("bgCanvas");
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 28);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffa36b, 0.7));
    const main = new THREE.DirectionalLight(0xffffff, 2.0);
    main.position.set(15, 22, 18);
    scene.add(main);
    const fill = new THREE.DirectionalLight(0xdc2626, 0.9);
    fill.position.set(-18, -12, 12);
    scene.add(fill);
    const accent = new THREE.PointLight(0xf59e0b, 2.2, 35);
    accent.position.set(-5, 4, 10);
    scene.add(accent);

    root = new THREE.Group();
    scene.add(root);
    cabinetGroup = new THREE.Group();
    plateGroup = new THREE.Group();
    componentsGroup = new THREE.Group();
    wiresGroup = new THREE.Group();
    [cabinetGroup, plateGroup, componentsGroup, wiresGroup].forEach(g => root.add(g));

    buildCabinet();
    buildComponents();
    buildWiring();
    buildTimeline();

    window.addEventListener("resize", onResize);
    ready = true;
  }

  function onResize() {
    if (!ready) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function frame(now) {
    if (!running) { rafId = null; return; }
    rafId = requestAnimationFrame(frame);

    // Rotation lente et continue de l'ensemble (remplace OrbitControls).
    root.rotation.y = Math.sin(now / 5500) * 0.55;

    if (currentStep === 3) {
      pulseParticles.forEach(p => {
        p.progress = (p.progress + 0.006) % 1;
        p.mesh.position.copy(p.curve.getPointAt(p.progress));
      });
    }
    if (networkLeds.length && Math.random() < 0.12) {
      const led = networkLeds[Math.floor(Math.random() * networkLeds.length)];
      led.material.emissiveIntensity = Math.random() > 0.5 ? 0.9 : 0.1;
    }
    renderer.render(scene, camera);
  }

  function start() {
    if (running) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!hasWebGL()) return;
    running = true;  // posé tout de suite : stop() peut survenir pendant le chargement
    ensureLibs().then(() => {
      if (!ready) init();
      const box = document.getElementById("bgCanvas");
      if (box) box.classList.add("visible");
      if (timeline) timeline.play();
      if (running && !rafId) rafId = requestAnimationFrame(frame);
    }).catch(err => {
      running = false;
      console.warn("Fond 3D SMATI indisponible :", err);
    });
  }

  function stop() {
    running = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    if (timeline) timeline.pause();
    const box = document.getElementById("bgCanvas");
    if (box) box.classList.remove("visible");
  }

  window.SmatiBg = { start, stop };
})();
