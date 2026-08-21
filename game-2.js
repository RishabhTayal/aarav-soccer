  // ---------- Helpers ----------
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function teamPlayers(team) { return players.filter(p => p.team === team); }
  function oppTeam(t) { return t === BLUE ? ORANGE : BLUE; }
  function goalCenter(teamAttacking) {
    // Blue attacks right goal, orange attacks left
    return teamAttacking === BLUE
      ? { x: FIELD_W + 0.2, y: FIELD_H / 2 }
      : { x: -0.2, y: FIELD_H / 2 };
  }
  function ownGoalX(team) {
    return team === BLUE ? 0 : FIELD_W;
  }

  function burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 4 + Math.random() * 16;
      particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.5 + Math.random() * 0.5, max: 1,
        color, r: 0.25 + Math.random() * 0.35,
      });
    }
  }

  function kickDust(x, y) {
    burst(x, y, "rgba(255,255,255,0.8)", 8);
  }

  // ---------- Possession / flick ----------
  function holder() {
    return ball.owner;
  }

  function nearest(team, x, y, except) {
    let best = null, bestD = 1e9;
    for (const p of players) {
      if (p.team !== team) continue;
      if (except && p.id === except.id) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  function tryTrap() {
    if (state.trapLock > 0) return;
    if (ball.owner) return;
    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed > 22) return;
    let best = null, bestD = 1e9;
    for (const p of players) {
      if (p.stunned > 0) continue;
      const reach = p.r + ball.r + (speed < 8 ? 1.15 : 0.55);
      const d = Math.hypot(p.x - ball.x, p.y - ball.y);
      if (d < reach && d < bestD) { bestD = d; best = p; }
    }
    if (best) {
      ball.owner = best;
      ball.lastOwner = best;
      ball.vx = 0; ball.vy = 0;
      state.possession = best.team;
      best.kickCool = 0.12;
    }
  }

  function releaseBall() {
    if (ball.owner) ball.lastOwner = ball.owner;
    ball.owner = null;
    state.trapLock = 0.28;
  }

  function aimTeammate(kicker, dirx, diry) {
    let best = null, bestScore = 0.42; // ~65° cone so kids connect passes
    for (const p of players) {
      if (p.team !== kicker.team || p.id === kicker.id) continue;
      const tx = p.x - kicker.x, ty = p.y - kicker.y;
      const td = Math.hypot(tx, ty) || 1;
      const nx = tx / td, ny = ty / td;
      const dot = nx * dirx + ny * diry;
      if (dot > bestScore && td < 42) {
        bestScore = dot;
        best = p;
      }
    }
    return best;
  }

  function shotOnGoal(team, dirx, diry, fromX, fromY) {
    const g = goalCenter(team);
    const tx = g.x - fromX, ty = g.y - fromY;
    const td = Math.hypot(tx, ty) || 1;
    const dot = (tx / td) * dirx + (ty / td) * diry;
    // also check if ray would hit goal mouth y-range
    const gx = team === BLUE ? FIELD_W : 0;
    if (Math.abs(dirx) < 0.15) return false;
    const t = (gx - fromX) / dirx;
    if (t < 0) return false;
    const iy = fromY + diry * t;
    const inMouth = iy > FIELD_H / 2 - GOAL_H / 2 - 3 && iy < FIELD_H / 2 + GOAL_H / 2 + 3;
    return dot > 0.42 && inMouth;
  }

  function doFlick(dx, dy, distPix, dt, endX, endY) {
    const len = Math.hypot(dx, dy) || 1;
    let dirx = dx / len, diry = dy / len;
    const power = clamp(distPix / 22, 0.18, 1);
    const speedBoost = clamp(140 / dt, 0.7, 1.6);
    const owner = ball.owner;

    if (owner && owner.team === BLUE) {
      kickFrom(owner, dirx, diry, power, speedBoost);
      return;
    }

    // Opponent has the ball or loose: swipe near ball to poke / tackle
    const nearBall = Math.hypot(endX - ball.x, endY - ball.y) < 10
      || Math.hypot(input.sx - ball.x, input.sy - ball.y) < 12;
    if (nearBall) {
      const chaser = nearest(BLUE, ball.x, ball.y);
      if (chaser) {
        const d = dist(chaser, ball);
        if (d < 7.5) {
          pokeBall(chaser, dirx, diry, power, speedBoost);
          return;
        }
      }
    }

    // If blue has a loose ball very close, treat as kick
    const closeBlue = nearest(BLUE, ball.x, ball.y);
    if (closeBlue && dist(closeBlue, ball) < 4.2 && !owner) {
      kickFrom(closeBlue, dirx, diry, power, speedBoost);
    }
  }

  function kickFrom(p, dirx, diry, power, speedBoost) {
    if (p.kickCool > 0) return;
    const passMate = aimTeammate(p, dirx, diry);
    const isShot = shotOnGoal(p.team, dirx, diry, p.x, p.y) && power > 0.38;
    let px = dirx, py = diry;
    let spd;

    if (passMate && !isShot && power < 0.82) {
      const tx = passMate.x - p.x, ty = passMate.y - p.y;
      const td = Math.hypot(tx, ty) || 1;
      // lead the teammate a little
      const lx = (passMate.x + passMate.vx * 0.25) - p.x;
      const ly = (passMate.y + passMate.vy * 0.25) - p.y;
      const ld = Math.hypot(lx, ly) || 1;
      px = lerp(dirx, lx / ld, 0.62);
      py = lerp(diry, ly / ld, 0.62);
      const n = Math.hypot(px, py) || 1;
      px /= n; py /= n;
      spd = clamp(18 + td * 0.55, 16, 34) * (0.75 + power * 0.4);
      audio.pass();
    } else {
      spd = (isShot ? 36 : 28) * (0.55 + power * 0.7) * speedBoost;
      spd = clamp(spd, 14, 48);
      audio.kick();
    }

    releaseBall();
    ball.x = p.x + px * (p.r + ball.r + 0.15);
    ball.y = p.y + py * (p.r + ball.r + 0.15);
    ball.vx = px * spd;
    ball.vy = py * spd;
    ball.lastOwner = p;
    state.lastTouch = p.team;
    p.kickCool = 0.28;
    kickDust(ball.x, ball.y);
    if (isShot) shake = Math.max(shake, 4);
  }

  function pokeBall(p, dirx, diry, power, speedBoost) {
    if (p.kickCool > 0) return;
    const d = dist(p, ball);
    if (d > 7.5) return;
    audio.tackle();
    if (ball.owner && ball.owner.team !== p.team) {
      ball.owner.stunned = 0.55;
    }
    releaseBall();
    state.trapLock = 0.4;
    const spd = 16 * (0.5 + power) * speedBoost;
    ball.vx = dirx * spd + (Math.random() - 0.5) * 3;
    ball.vy = diry * spd + (Math.random() - 0.5) * 3;
    ball.lastOwner = p;
    state.lastTouch = p.team;
    p.kickCool = 0.35;
    burst(ball.x, ball.y, "#fff", 10);
  }

  function tryTap(x, y) {
    // tap a blue player to make them the pressure target — they sprint to ball
    let best = null, bestD = 4.5;
    for (const p of players) {
      if (p.team !== BLUE) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestD) { bestD = d; best = p; }
    }
    if (best) best.pressed = 1.6;
  }
