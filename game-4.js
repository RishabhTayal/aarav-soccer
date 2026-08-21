  // ---------- View ----------
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    const pad = Math.max(8, Math.min(w, h) * 0.03);
    const topHud = 58;
    const botHud = 28;
    const availW = w - pad * 2;
    const availH = h - pad * 2 - topHud * 0.35 - botHud * 0.25;
    const s = Math.min(availW / FIELD_W, availH / FIELD_H);
    view.s = s;
    view.x = (w - FIELD_W * s) / 2;
    view.y = Math.max(topHud * 0.55, (h - FIELD_H * s) / 2);
    view.pad = pad;
  }
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => setTimeout(resize, 120));

  function toX(x) { return view.x + x * view.s; }
  function toY(y) { return view.y + y * view.s; }

  // ---------- Draw ----------
  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function drawField() {
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    ctx.fillStyle = "#1b6b2e";
    ctx.fillRect(0, 0, w, h);

    const fx = toX(0), fy = toY(0), fw = FIELD_W * view.s, fh = FIELD_H * view.s;

    // grass stripes
    const stripes = 10;
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 === 0 ? "#34a34c" : "#2d9244";
      ctx.fillRect(fx + (fw / stripes) * i, fy, fw / stripes + 1, fh);
    }

    // pitch border fill already is stripes; now lines
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, fx, fy, fw, fh, 8);
    ctx.clip();

    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.lineWidth = Math.max(2, view.s * 0.12);
    ctx.strokeRect(fx + 2, fy + 2, fw - 4, fh - 4);

    // halfway
    ctx.beginPath();
    ctx.moveTo(toX(FIELD_W / 2), fy);
    ctx.lineTo(toX(FIELD_W / 2), fy + fh);
    ctx.stroke();

    // center circle
    ctx.beginPath();
    ctx.arc(toX(FIELD_W / 2), toY(FIELD_H / 2), 9.15 * view.s, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(toX(FIELD_W / 2), toY(FIELD_H / 2), 0.45 * view.s, 0, Math.PI * 2);
    ctx.fill();

    // boxes
    function box(x, w) {
      const bh = 40;
      const by = (FIELD_H - bh) / 2;
      ctx.strokeRect(toX(x), toY(by), w * view.s, bh * view.s);
      const sh = 18;
      const sy = (FIELD_H - sh) / 2;
      const sw = w > 0 ? 6 : -6;
      ctx.strokeRect(toX(x), toY(sy), sw * view.s, sh * view.s);
    }
    box(0, 16.5);
    box(FIELD_W, -16.5);

    // penalty spots
    ctx.beginPath();
    ctx.arc(toX(11), toY(FIELD_H / 2), 0.35 * view.s, 0, Math.PI * 2);
    ctx.arc(toX(FIELD_W - 11), toY(FIELD_H / 2), 0.35 * view.s, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // goals (outside pitch a bit)
    drawGoal(0, true);
    drawGoal(FIELD_W, false);

    // stands / rim
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 6;
    roundRect(ctx, fx - 6, fy - 6, fw + 12, fh + 12, 12);
    ctx.stroke();
  }

  function drawGoal(x, left) {
    const gy0 = FIELD_H / 2 - GOAL_H / 2;
    const netW = GOAL_W * view.s;
    const x0 = left ? toX(x) - netW : toX(x);
    const y0 = toY(gy0);
    const h = GOAL_H * view.s;

    ctx.fillStyle = left ? "rgba(43,108,255,0.22)" : "rgba(255,122,26,0.22)";
    ctx.fillRect(x0, y0, netW, h);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = Math.max(3, view.s * 0.2);
    ctx.strokeRect(x0, y0, netW, h);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1;
    const steps = 5;
    for (let i = 1; i < steps; i++) {
      ctx.beginPath();
      ctx.moveTo(x0 + (netW / steps) * i, y0);
      ctx.lineTo(x0 + (netW / steps) * i, y0 + h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x0, y0 + (h / steps) * i);
      ctx.lineTo(x0 + netW, y0 + (h / steps) * i);
      ctx.stroke();
    }
    // posts
    ctx.fillStyle = "#f4f4f4";
    ctx.fillRect(toX(x) - 2, y0 - 3, 4, h + 6);
  }

  function drawPlayer(p) {
    const x = toX(p.x), y = toY(p.y);
    const r = p.r * view.s;
    const blue = p.team === BLUE;
    const body = blue ? "#2b6cff" : "#ff7a1a";
    const dark = blue ? "#163e9c" : "#c45300";
    const accent = blue ? "#8cbcff" : "#ffd0a3";

    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.85, r * 0.85, r * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();

    // highlight ring if has ball or is Aarav
    if (ball.owner === p) {
      ctx.strokeStyle = "#ffe56a";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, r + 5, 0, Math.PI * 2);
      ctx.stroke();
    } else if (p.team === BLUE && !ball.owner && dist(p, ball) < 8) {
      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r + 4, 0, Math.PI * 2);
      ctx.stroke();
    } else if (p.team === BLUE && ball.owner && ball.owner.team === ORANGE && p === nearest(BLUE, ball.x, ball.y)) {
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(x, y, r + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (p.name === "Aarav") {
      ctx.strokeStyle = "rgba(255,229,106,0.45)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r + 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    // body
    const grd = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.2, x, y, r);
    grd.addColorStop(0, accent);
    grd.addColorStop(0.45, body);
    grd.addColorStop(1, dark);
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // number
    ctx.fillStyle = "#fff";
    ctx.font = "800 " + Math.max(10, r * 0.95) + "px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(p.num), x, y + 0.5);

    // name for Aarav
    if (p.name === "Aarav") {
      ctx.font = "800 " + Math.max(10, r * 0.55) + "px system-ui, sans-serif";
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 3;
      ctx.strokeText("Aarav", x, y - r - 8);
      ctx.fillText("Aarav", x, y - r - 8);
    }
  }

  function drawBall() {
    const x = toX(ball.x), y = toY(ball.y);
    const r = ball.r * view.s * 1.15;

    // motion trail
    const spd = Math.hypot(ball.vx, ball.vy);
    if (spd > 10 && !ball.owner) {
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.beginPath();
      ctx.arc(x - ball.vx * view.s * 0.03, y - ball.vy * view.s * 0.03, r * 0.75, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.7, r * 0.75, r * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#f5f5f5";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#222";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // simple pentagon-ish patches
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * Math.PI * 2 / 5 + ball.x * 0.4;
      const px = x + Math.cos(a) * r * 0.38;
      const py = y + Math.sin(a) * r * 0.38;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  function drawAim() {
    if (!input.down || state.mode !== "playing") return;
    const owner = ball.owner;
    const canKick = (owner && owner.team === BLUE) || (!owner && nearest(BLUE, ball.x, ball.y) && dist(nearest(BLUE, ball.x, ball.y), ball) < 5);
    const tackle = !canKick;
    ctx.save();
    ctx.strokeStyle = tackle ? "rgba(255,255,255,0.55)" : "rgba(255,229,106,0.9)";
    ctx.fillStyle = tackle ? "rgba(255,255,255,0.2)" : "rgba(255,229,106,0.25)";
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(toX(input.sx), toY(input.sy));
    ctx.lineTo(toX(input.x), toY(input.y));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(toX(input.x), toY(input.y), 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96; p.vy *= 0.96;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      ctx.globalAlpha = p.life / (p.max || 1);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(toX(p.x), toY(p.y), p.r * view.s, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawNamesUnder() {
    // nothing extra
  }

  // ---------- Loop ----------
  function tick(t) {
    const dt = Math.min(0.033, (t - lastT) / 1000 || 0.016);
    lastT = t;

    if (hintUntil && performance.now() > hintUntil) {
      hintEl.classList.remove("show");
      hintUntil = 0;
    }

    if (state.mode === "kickoff") {
      state.kickoffT -= dt;
      if (state.kickoffT <= 0) {
        state.mode = "playing";
        showToast("GO!");
      }
    }
    if (state.mode === "celebrate") {
      state.celebrateT -= dt;
      if (state.celebrateT <= 0) {
        placeKickoff();
        state.mode = "kickoff";
        state.kickoffT = 0.9;
        audio.whistle();
        showToast("GO!");
      }
    }

    if (state.mode === "playing" || state.mode === "kickoff") {
      if (state.mode === "playing") {
        for (const p of players) {
          movePlayer(p, dt);
          aiKickIfNeeded(p, dt);
        }
        separatePlayers();
        moveBall(dt);
        bounceBallPlayers();
        tryTrap();
        keeperSave(dt);
        checkGoal();

        // anti-stuck: if ball is frozen with no owner for too long, nudge nearest
        if (!ball.owner && Math.hypot(ball.vx, ball.vy) < 0.2) {
          ball.stuck = (ball.stuck || 0) + dt;
          if (ball.stuck > 2.8) {
            const n = nearest(state.lastTouch ?? BLUE, ball.x, ball.y);
            if (n) { ball.owner = n; ball.stuck = 0; }
          }
        } else ball.stuck = 0;
      } else {
        // kickoff freeze: still breathe a little
        for (const p of players) {
          p.x += Math.sin(t / 220 + p.num) * 0.002;
        }
      }
    }

    if (state.mode === "celebrate") {
      moveBall(dt * 0.4);
      for (const p of players) {
        p.x += Math.sin(t / 80 + p.num) * 0.02;
      }
    }

    shake *= 0.88;
    const ox = (Math.random() - 0.5) * shake;
    const oy = (Math.random() - 0.5) * shake;

    ctx.setTransform(dpr, 0, 0, dpr, ox * dpr, oy * dpr);
    drawField();
    // draw players back-to-front by y
    const order = players.slice().sort((a, b) => a.y - b.y);
    for (const p of order) drawPlayer(p);
    drawBall();
    drawAim();
    drawParticles(dt);

    requestAnimationFrame(tick);
  }

  formation();
  resize();
  requestAnimationFrame(tick);
  if (/\bautostart\b/.test(location.search)) {
    setTimeout(() => { if (state.mode === "menu") startMatch(true); }, 80);
  }
  if (/\btestgoal\b/.test(location.search)) {
    setTimeout(() => {
      if (state.mode === "menu") startMatch(true);
      setTimeout(() => {
        ball.owner = null;
        ball.x = FIELD_W + 0.8;
        ball.y = FIELD_H / 2;
        ball.vx = 8; ball.vy = 0;
        state.mode = "playing";
        checkGoal();
      }, 700);
    }, 80);
  }

  // Prevent pull-to-refresh / scroll
  document.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
