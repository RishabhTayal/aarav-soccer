  // ---------- AI ----------
  function desiredFor(p) {
    const has = ball.owner;
    const myTeamHas = has && has.team === p.team;
    const loose = !has;
    const gAttack = goalCenter(p.team);
    const gDefend = { x: ownGoalX(p.team), y: FIELD_H / 2 };
    const ballSide = p.team === BLUE ? (ball.x > FIELD_W * 0.55) : (ball.x < FIELD_W * 0.45);

    if (p.role === "gk") {
      const boxX = p.team === BLUE ? 7.5 : FIELD_W - 7.5;
      let ty = clamp(ball.y, FIELD_H / 2 - GOAL_H * 0.42, FIELD_H / 2 + GOAL_H * 0.42);
      let tx = boxX;
      // come out on shots
      const towardOwn = p.team === BLUE ? ball.vx < -10 : ball.vx > 10;
      if (!myTeamHas && towardOwn && Math.abs(ball.y - FIELD_H / 2) < GOAL_H) {
        tx = p.team === BLUE ? clamp(ball.x - 2, 4, 16) : clamp(ball.x + 2, FIELD_W - 16, FIELD_W - 4);
        ty = lerp(ty, ball.y, 0.55);
      }
      return { x: tx, y: ty, sprint: towardOwn ? 1 : 0.7 };
    }

    if (has === p) {
      // dribble / decide to pass or shoot
      return { x: lerp(p.x, gAttack.x, 0.08), y: lerp(p.y, gAttack.y + Math.sin(p.id.charCodeAt(1)) * 6, 0.12), sprint: 0.85, onBall: true };
    }

    if (p.pressed > 0) {
      return { x: ball.x, y: ball.y, sprint: 1.15 };
    }

    if (myTeamHas) {
      // support: get open ahead and wide
      const holderP = has;
      const ahead = p.team === BLUE ? 14 : -14;
      const wide = (p.role === "fwd" ? 1 : -1) * (p.team === BLUE ? 12 : -12);
      let tx = clamp(holderP.x + ahead, 10, FIELD_W - 10);
      let ty = clamp(holderP.y + wide + Math.sin(performance.now() / 400 + p.num) * 3, 8, FIELD_H - 8);
      // stay offside-ish reasonable
      if (p.team === BLUE) tx = Math.min(tx, FIELD_W - 12);
      else tx = Math.max(tx, 12);
      return { x: tx, y: ty, sprint: 0.8 };
    }

    // defending / chase loose ball
    const mates = teamPlayers(p.team).filter(m => m.role !== "gk");
    const closest = mates.slice().sort((a, b) => dist(a, ball) - dist(b, ball))[0];
    if (p === closest || (loose && dist(p, ball) < 16)) {
      return { x: ball.x, y: ball.y, sprint: 1.05 };
    }
    // mark: stay between ball and own goal
    const mx = lerp(ball.x, gDefend.x, 0.35);
    const my = lerp(ball.y, gDefend.y, 0.2);
    return { x: clamp(mx, 8, FIELD_W - 8), y: clamp(my, 8, FIELD_H - 8), sprint: 0.85 };
  }

  function aiKickIfNeeded(p, dt) {
    if (ball.owner !== p) return;
    if (p.team === BLUE) return; // human flicks for blue
    if (p.kickCool > 0) return;
    p.aiThink = (p.aiThink || 0) + dt;
    const g = goalCenter(p.team);
    const toG = Math.hypot(g.x - p.x, g.y - p.y);
    const presser = nearest(oppTeam(p.team), p.x, p.y);
    const pressD = presser ? dist(presser, p) : 99;
    const dirG = { x: g.x - p.x, y: clamp(g.y - p.y, -8, 8) };
    const gl = Math.hypot(dirG.x, dirG.y) || 1;
    dirG.x /= gl; dirG.y /= gl;

    const shouldShoot = toG < 24 && Math.abs(p.y - FIELD_H / 2) < GOAL_H * 0.62 && p.aiThink > 0.55;
    const shouldPass = pressD < 4.6 && p.aiThink > 0.4;
    const shouldClear = p.role === "gk" && p.aiThink > 0.35;
    const dribbleTooLong = p.aiThink > 2.1;

    if (shouldShoot || shouldPass || shouldClear || dribbleTooLong) {
      let dx = dirG.x, dy = dirG.y;
      if (shouldPass && !shouldShoot) {
        const mate = aimTeammate(p, dirG.x, dirG.y) || teamPlayers(p.team).find(m => m.id !== p.id && m.role !== "gk");
        if (mate) {
          dx = mate.x - p.x; dy = mate.y - p.y;
          const n = Math.hypot(dx, dy) || 1; dx /= n; dy /= n;
        }
      }
      if (shouldClear) {
        dx = p.team === BLUE ? 0.85 : -0.85;
        dy = (Math.random() - 0.5) * 0.6;
        const n = Math.hypot(dx, dy) || 1; dx /= n; dy /= n;
      }
      const power = shouldShoot ? 0.86 : shouldClear ? 0.7 : 0.5;
      kickFrom(p, dx, dy, power, 1);
      p.aiThink = 0;
    }
  }

  function keeperSave(dt) {
    // If a fast ball is heading into the goal, snap keeper toward intercept
    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed < 12 || ball.owner) return;
    for (const side of [BLUE, ORANGE]) {
      const gk = players.find(p => p.team === side && p.role === "gk");
      if (!gk) continue;
      const gx = side === BLUE ? 0 : FIELD_W;
      if (side === BLUE && ball.vx >= 0) continue;
      if (side === ORANGE && ball.vx <= 0) continue;
      const t = (gx - ball.x) / (ball.vx || 1e-6);
      if (t < 0 || t > 1.1) continue;
      const iy = ball.y + ball.vy * t;
      if (iy < FIELD_H / 2 - GOAL_H / 2 - 1 || iy > FIELD_H / 2 + GOAL_H / 2 + 1) continue;
      const ix = gx;
      const d = Math.hypot(gk.x - ix, gk.y - iy);
      if (d < (side === ORANGE ? 7.2 : 9.5)) {
        // dive toward intercept (orange keeper a bit less sticky)
        gk.x = lerp(gk.x, ix + (side === BLUE ? 1.2 : -1.2), side === ORANGE ? 0.12 : 0.18);
        gk.y = lerp(gk.y, clamp(iy, FIELD_H / 2 - GOAL_H / 2, FIELD_H / 2 + GOAL_H / 2), side === ORANGE ? 0.18 : 0.28);
        if (Math.hypot(gk.x - ball.x, gk.y - ball.y) < gk.r + ball.r + 0.9) {
          // block
          const nx = ball.x - gk.x, ny = ball.y - gk.y;
          const nl = Math.hypot(nx, ny) || 1;
          ball.owner = null;
          ball.vx = (nx / nl) * speed * 0.35 + (side === BLUE ? 8 : -8);
          ball.vy = (ny / nl) * speed * 0.25 + (Math.random() - 0.5) * 6;
          state.trapLock = 0.12;
          shake = Math.max(shake, 3);
          burst(ball.x, ball.y, "#fff", 12);
          audio.tackle();
        }
      }
    }
  }

  // ---------- Physics ----------
  function movePlayer(p, dt) {
    if (p.stunned > 0) p.stunned -= dt;
    if (p.kickCool > 0) p.kickCool -= dt;
    if (p.pressed > 0) p.pressed -= dt;

    const want = desiredFor(p);
    const dx = want.x - p.x, dy = want.y - p.y;
    const d = Math.hypot(dx, dy);
    const teamMul = p.team === ORANGE ? 0.88 : 1.04;
    const maxSpd = (p.role === "gk" ? 13 : 16.5) * (want.sprint || 1) * teamMul;
    if (d > 0.2) {
      const acc = 55;
      p.vx += (dx / d) * acc * dt;
      p.vy += (dy / d) * acc * dt;
    }
    const spd = Math.hypot(p.vx, p.vy);
    if (spd > maxSpd) {
      p.vx *= maxSpd / spd;
      p.vy *= maxSpd / spd;
    }
    p.vx *= 0.86;
    p.vy *= 0.86;
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // hold ball slightly in front
    if (ball.owner === p) {
      const faceX = p.team === BLUE ? 1 : -1;
      const fx = p.vx !== 0 || p.vy !== 0 ? p.vx : faceX;
      const fy = p.vy;
      const fl = Math.hypot(fx, fy) || 1;
      ball.x = p.x + (fx / fl) * (p.r + 0.15);
      ball.y = p.y + (fy / fl) * (p.r * 0.15);
      ball.vx = p.vx; ball.vy = p.vy;
    }

    // bounds
    p.x = clamp(p.x, p.r + 0.4, FIELD_W - p.r - 0.4);
    p.y = clamp(p.y, p.r + 0.4, FIELD_H - p.r - 0.4);
    if (p.role === "gk") {
      if (p.team === BLUE) p.x = clamp(p.x, 3, 18);
      else p.x = clamp(p.x, FIELD_W - 18, FIELD_W - 3);
      p.y = clamp(p.y, FIELD_H / 2 - GOAL_H * 0.7, FIELD_H / 2 + GOAL_H * 0.7);
    }
  }

  function separatePlayers() {
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const a = players[i], b = players[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.001;
        const min = a.r + b.r - 0.1;
        if (d < min) {
          const push = (min - d) * 0.5;
          const nx = dx / d, ny = dy / d;
          a.x -= nx * push; a.y -= ny * push;
          b.x += nx * push; b.y += ny * push;
        }
      }
    }
  }

  function bounceBallPlayers() {
    if (ball.owner) return;
    for (const p of players) {
      const dx = ball.x - p.x, dy = ball.y - p.y;
      const d = Math.hypot(dx, dy) || 0.001;
      const min = ball.r + p.r;
      if (d < min) {
        const nx = dx / d, ny = dy / d;
        ball.x = p.x + nx * min;
        ball.y = p.y + ny * min;
        const rel = (ball.vx - p.vx) * nx + (ball.vy - p.vy) * ny;
        if (rel < 0) {
          ball.vx -= 1.55 * rel * nx;
          ball.vy -= 1.55 * rel * ny;
        }
        // slow ball a bit on body
        ball.vx *= 0.92; ball.vy *= 0.92;
        if (p.team !== (ball.lastOwner && ball.lastOwner.team) && Math.hypot(ball.vx, ball.vy) < 14) {
          // chance to control
          if (Math.random() < 0.45 && state.trapLock <= 0) {
            ball.owner = p;
            ball.lastOwner = p;
            ball.vx = 0; ball.vy = 0;
            state.possession = p.team;
            p.kickCool = 0.15;
          }
        }
      }
    }
  }

  function moveBall(dt) {
    if (state.trapLock > 0) state.trapLock -= dt;
    if (ball.owner) return;

    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    const damp = Math.exp(-2.4 * dt);
    ball.vx *= damp;
    ball.vy *= damp;
    const spdNow = Math.hypot(ball.vx, ball.vy);
    if (spdNow > 52) { ball.vx *= 52 / spdNow; ball.vy *= 52 / spdNow; }
    if (spdNow < 0.35) { ball.vx = 0; ball.vy = 0; }

    // sidelines / endlines, but allow goal mouths
    const gy0 = FIELD_H / 2 - GOAL_H / 2;
    const gy1 = FIELD_H / 2 + GOAL_H / 2;
    const inMouth = ball.y > gy0 + 0.05 && ball.y < gy1 - 0.05;

    if (ball.y < ball.r) { ball.y = ball.r; ball.vy = Math.abs(ball.vy) * 0.72; }
    if (ball.y > FIELD_H - ball.r) { ball.y = FIELD_H - ball.r; ball.vy = -Math.abs(ball.vy) * 0.72; }

    // left end — open if in goal mouth
    if (ball.x < ball.r) {
      if (inMouth) {
        ball.y = clamp(ball.y, gy0 + ball.r, gy1 - ball.r);
      } else {
        ball.x = ball.r;
        ball.vx = Math.abs(ball.vx) * 0.7;
      }
    }
    // right end
    if (ball.x > FIELD_W - ball.r) {
      if (inMouth) {
        ball.y = clamp(ball.y, gy0 + ball.r, gy1 - ball.r);
      } else {
        ball.x = FIELD_W - ball.r;
        ball.vx = -Math.abs(ball.vx) * 0.7;
      }
    }

    // goal posts
    bouncePost(0, gy0);
    bouncePost(0, gy1);
    bouncePost(FIELD_W, gy0);
    bouncePost(FIELD_W, gy1);

    // keep ball inside the net, don't yank it back onto the pitch
    if (ball.x < -GOAL_W) { ball.x = -GOAL_W + ball.r; ball.vx *= 0.3; }
    if (ball.x > FIELD_W + GOAL_W) { ball.x = FIELD_W + GOAL_W - ball.r; ball.vx *= 0.3; }
  }

  function bouncePost(px, py) {
    const dx = ball.x - px, dy = ball.y - py;
    const d = Math.hypot(dx, dy);
    const pr = 0.55;
    if (d < ball.r + pr && d > 0) {
      const nx = dx / d, ny = dy / d;
      ball.x = px + nx * (ball.r + pr);
      ball.y = py + ny * (ball.r + pr);
      const rel = ball.vx * nx + ball.vy * ny;
      if (rel < 0) {
        ball.vx -= 1.8 * rel * nx;
        ball.vy -= 1.8 * rel * ny;
      }
    }
  }

  function checkGoal() {
    if (state.mode !== "playing") return;
    const gy0 = FIELD_H / 2 - GOAL_H / 2 + 0.15;
    const gy1 = FIELD_H / 2 + GOAL_H / 2 - 0.15;
    if (ball.y > gy0 && ball.y < gy1) {
      if (ball.x < 0) {
        goalScored(ORANGE);
        return;
      }
      if (ball.x > FIELD_W) {
        goalScored(BLUE);
        return;
      }
    }
    // if ball went past endline outside goal, throw-in-ish: keep in play bounce already handled
  }
