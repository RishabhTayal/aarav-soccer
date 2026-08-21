  var canvas = document.getElementById("canvas");
  var ctx = canvas.getContext("2d");
  var overlay = document.getElementById("overlay");
  var card = document.getElementById("card");
  var playBtn = document.getElementById("playBtn");
  var scoreEl = document.getElementById("score");
  var muteBtn = document.getElementById("muteBtn");
  var toastEl = document.getElementById("toast");
  var hintEl = document.getElementById("hint");
  var flashEl = document.getElementById("flash");

  var FIELD_W = 110;
  var FIELD_H = 68;
  var GOAL_W = 3.2;
  var GOAL_H = 16;
  var BALL_R = 0.85;
  var PLAYER_R = 1.55;
  var WIN_SCORE = 5;

  var BLUE = 0;
  var ORANGE = 1;

  var dpr = 1;
  var view = { x: 0, y: 0, s: 1, pad: 10 };
  var lastT = 0;
  var shake = 0;
  var hintUntil = 0;
  var toastTimer = 0;

  var state = {
    mode: "menu", // menu | playing | celebrate | kickoff | over
    score: [0, 0],
    kickoffTeam: BLUE,
    celebrateT: 0,
    kickoffT: 0,
    lastTouch: BLUE,
    possession: null,
    trapLock: 0,
  };

  var ball = {
    x: FIELD_W / 2, y: FIELD_H / 2,
    vx: 0, vy: 0,
    r: BALL_R,
    owner: null,
    lastOwner: null,
  };

  var players = [];
  var particles = [];
  var trails = [];

  function makePlayer(id, team, num, name, role, x, y) {
    return {
      id, team, num, name, role,
      x, y, vx: 0, vy: 0,
      homeX: x, homeY: y,
      r: role === "gk" ? PLAYER_R * 1.08 : PLAYER_R,
      face: 1,
      kickCool: 0,
      stunned: 0,
    };
  }

  function formation() {
    players.length = 0;
    // Blue attacks right. Keeper left.
    players.push(makePlayer("b1", BLUE, 1, "Dev", "gk", 8, FIELD_H / 2));
    players.push(makePlayer("b7", BLUE, 7, "Leo", "mid", 38, FIELD_H * 0.32));
    players.push(makePlayer("b10", BLUE, 10, "Aarav", "fwd", 48, FIELD_H * 0.58));
    // Orange attacks left. Keeper right.
    players.push(makePlayer("o1", ORANGE, 1, "Max", "gk", FIELD_W - 8, FIELD_H / 2));
    players.push(makePlayer("o8", ORANGE, 8, "Rio", "mid", FIELD_W - 38, FIELD_H * 0.68));
    players.push(makePlayer("o9", ORANGE, 9, "Kai", "fwd", FIELD_W - 48, FIELD_H * 0.42));
  }

  // ---------- Audio ----------
  var audio = {
    ctx: null,
    muted: false,
    ensure() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) this.ctx = new AC();
      }
      if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
    },
    tone(freq, dur, type, vol, slide) {
      if (this.muted || !this.ctx) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type || "sine";
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
      g.gain.setValueAtTime(vol || 0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(this.ctx.destination);
      o.start(t); o.stop(t + dur);
    },
    noise(dur, vol) {
      if (this.muted || !this.ctx) return;
      const n = this.ctx.sampleRate * dur;
      const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const s = this.ctx.createBufferSource();
      const g = this.ctx.createGain();
      const f = this.ctx.createBiquadFilter();
      f.type = "lowpass"; f.frequency.value = 900;
      s.buffer = buf; g.gain.value = vol || 0.08;
      s.connect(f); f.connect(g); g.connect(this.ctx.destination);
      s.start();
    },
    kick() { this.ensure(); this.noise(0.08, 0.1); this.tone(140, 0.12, "sine", 0.14, 70); },
    pass() { this.ensure(); this.tone(420, 0.08, "triangle", 0.08); },
    goal() {
      this.ensure();
      this.tone(392, 0.16, "square", 0.09);
      setTimeout(() => this.tone(523, 0.16, "square", 0.09), 120);
      setTimeout(() => this.tone(659, 0.28, "square", 0.1), 240);
    },
    whistle() { this.ensure(); this.tone(1400, 0.22, "sine", 0.07); setTimeout(() => this.tone(1200, 0.18, "sine", 0.06), 200); },
    tackle() { this.ensure(); this.noise(0.06, 0.12); this.tone(90, 0.1, "sawtooth", 0.06); },
    win() { this.ensure(); [523,659,784,1046].forEach((f,i) => setTimeout(() => this.tone(f, 0.22, "triangle", 0.1), i * 140)); },
  };

  muteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    audio.muted = !audio.muted;
    muteBtn.textContent = audio.muted ? "🔇" : "🔊";
    if (!audio.muted) audio.ensure();
  });

  // ---------- Input ----------
  var input = {
    down: false,
    sx: 0, sy: 0,
    x: 0, y: 0,
    t0: 0,
    path: [],
  };

  function canvasToField(cx, cy) {
    const r = canvas.getBoundingClientRect();
    const px = (cx - r.left) * (canvas.width / r.width);
    const py = (cy - r.top) * (canvas.height / r.height);
    return {
      x: (px / dpr - view.x) / view.s,
      y: (py / dpr - view.y) / view.s,
    };
  }

  function onDown(e) {
    if (state.mode !== "playing") return;
    e.preventDefault();
    const p = e.touches ? e.touches[0] : e;
    const f = canvasToField(p.clientX, p.clientY);
    input.down = true;
    input.sx = f.x; input.sy = f.y;
    input.x = f.x; input.y = f.y;
    input.t0 = performance.now();
    input.path = [{ x: f.x, y: f.y }];
  }
  function onMove(e) {
    if (!input.down) return;
    e.preventDefault();
    const p = e.touches ? e.touches[0] : e;
    const f = canvasToField(p.clientX, p.clientY);
    input.x = f.x; input.y = f.y;
    input.path.push({ x: f.x, y: f.y });
    if (input.path.length > 18) input.path.shift();
  }
  function onUp(e) {
    if (!input.down) return;
    if (e) e.preventDefault();
    input.down = false;
    if (state.mode !== "playing") return;
    const dt = Math.max(16, performance.now() - input.t0);
    const dx = input.x - input.sx;
    const dy = input.y - input.sy;
    const dist = Math.hypot(dx, dy);
    // Use last segment for flickier feel
    let fx = dx, fy = dy;
    if (input.path.length >= 3) {
      const a = input.path[input.path.length - 3];
      const b = input.path[input.path.length - 1];
      fx = b.x - a.x; fy = b.y - a.y;
    }
    const flick = Math.hypot(fx, fy);
    if (dist < 3.2 && flick < 1.6) {
      // tap: switch pressure target if opponent has ball
      tryTap(input.x, input.y);
      return;
    }
    doFlick(dx, dy, dist, dt, input.x, input.y);
    input.path = [];
  }

  canvas.addEventListener("mousedown", onDown);
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  canvas.addEventListener("touchstart", onDown, { passive: false });
  window.addEventListener("touchmove", onMove, { passive: false });
  window.addEventListener("touchend", onUp, { passive: false });
  window.addEventListener("touchcancel", onUp, { passive: false });

  // ---------- Game flow ----------
  function resetBall(centerKick) {
    ball.x = FIELD_W / 2;
    ball.y = FIELD_H / 2 + (Math.random() - 0.5) * 0.2;
    ball.vx = 0; ball.vy = 0;
    ball.owner = null;
    ball.lastOwner = null;
    state.possession = null;
    state.trapLock = 0.25;
    if (centerKick) {
      // nibble toward kickoff team so someone can take it
    }
  }

  function placeKickoff() {
    const dir = state.kickoffTeam === BLUE ? 1 : -1;
    players.forEach((p) => {
      p.vx = 0; p.vy = 0; p.stunned = 0; p.kickCool = 0;
      if (p.role === "gk") {
        p.x = p.team === BLUE ? 8 : FIELD_W - 8;
        p.y = FIELD_H / 2;
      } else if (p.team === state.kickoffTeam) {
        if (p.role === "fwd") { p.x = FIELD_W / 2 - 6 * dir; p.y = FIELD_H / 2 + 3; }
        else { p.x = FIELD_W / 2 - 14 * dir; p.y = FIELD_H / 2 - 8; }
      } else {
        if (p.role === "fwd") { p.x = FIELD_W / 2 + 16 * dir; p.y = FIELD_H * 0.38; }
        else { p.x = FIELD_W / 2 + 22 * dir; p.y = FIELD_H * 0.62; }
      }
      p.homeX = p.x; p.homeY = p.y;
    });
    resetBall(true);
    const taker = players.find(p => p.team === state.kickoffTeam && p.role === "fwd")
      || players.find(p => p.team === state.kickoffTeam && p.role !== "gk");
    if (taker) {
      ball.owner = taker;
      ball.lastOwner = taker;
      state.possession = taker.team;
      ball.x = taker.x + (taker.team === BLUE ? 1.6 : -1.6);
      ball.y = taker.y;
    }
  }

  function startMatch(fromMenu) {
    state.score = [0, 0];
    state.kickoffTeam = BLUE;
    state.mode = "kickoff";
    state.kickoffT = 1.1;
    formation();
    placeKickoff();
    updateScore();
    overlay.classList.add("hidden");
    hintUntil = performance.now() + 8000;
    hintEl.classList.add("show");
    audio.whistle();
    showToast("Kickoff!");
  }

  function updateScore() {
    scoreEl.textContent = state.score[0] + " – " + state.score[1];
  }

  function showToast(text) {
    toastEl.textContent = text;
    toastEl.classList.remove("show");
    void toastEl.offsetWidth;
    toastEl.classList.add("show");
  }

  function goalScored(team) {
    state.score[team] += 1;
    updateScore();
    scoreEl.classList.remove("pop");
    void scoreEl.offsetWidth;
    scoreEl.classList.add("pop");
    flashEl.classList.remove("go");
    void flashEl.offsetWidth;
    flashEl.classList.add("go");
    shake = 10;
    burst(ball.x, ball.y, team === BLUE ? "#2b6cff" : "#ff7a1a", 36);
    audio.goal();
    if (state.score[team] >= WIN_SCORE) {
      state.mode = "over";
      setTimeout(() => {
        audio.win();
        const winner = team === BLUE ? "Aarav wins!" : "CPU wins!";
        card.innerHTML = "<h1>" + winner + "</h1><p>" + state.score[0] + " – " + state.score[1] + "</p><button class='play' id='againBtn'>Play again</button>";
        overlay.classList.remove("hidden");
        document.getElementById("againBtn").addEventListener("click", () => startMatch(false));
      }, 900);
      showToast(team === BLUE ? "GOAL! Aarav!" : "GOAL!");
      return;
    }
    state.mode = "celebrate";
    state.celebrateT = 1.7;
    state.kickoffTeam = team === BLUE ? ORANGE : BLUE;
    showToast(team === BLUE ? "GOAL! Aarav!" : "GOAL!");
  }

  playBtn.addEventListener("click", () => {
    audio.ensure();
    startMatch(true);
  });
