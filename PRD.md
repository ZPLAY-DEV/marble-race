# 3D Marble Race Web Game 개발 지시서

## 1. 프로젝트 목표

웹 브라우저에서 실행되는 **3D Marble Race 게임**을 개발한다.

일반적인 핀볼 게임이 아니다.

한국에서 흔히 볼 수 있는 "핀볼 랜덤 숫자 뽑기 / 공뽑기 / 사다리 게임"에서 아이디어를 가져온 **3D 랜덤 레이스 게임**이다.

여러 개의 구슬이 동시에 출발하고, 각 구슬은 장애물과 분기 구조에 의해 서로 다른 경로를 지나며 아래쪽 결승선에 도착한다.

최종적으로 **누가 가장 먼저 도착했는지 / 가장 늦게 도착했는지**를 판단하여 순위를 결정한다.

게임의 핵심은 다음 세 가지다.

1. 물리적으로 자연스럽게 움직이는 구슬
2. 플레이어가 결과를 예측하기 어려운 랜덤한 경로
3. 결과를 보는 과정 자체가 재미있는 3D 연출

---

# 2. 기술 스택

다음 기술을 기본으로 사용한다.

- PlayCanvas Engine
- TypeScript
- Vite
- npm 또는 pnpm
- Ammo.js physics
- WebGL 2
- WebGPU는 가능한 경우 선택적으로 사용하되 WebGL 2 fallback을 반드시 유지

PlayCanvas Editor에 의존하지 않고 **코드 중심의 standalone PlayCanvas Engine 프로젝트**로 구성한다.

이유는 Claude Code가 프로젝트의 모든 소스 코드를 직접 관리하고 수정할 수 있도록 하기 위함이다.

React는 필요하지 않다.

UI는 HTML/CSS 기반으로 구현한다.

게임 렌더링은 PlayCanvas canvas에서 담당하고, 일반적인 웹 UI는 HTML/CSS에서 담당한다.

---

# 3. 중요한 개발 원칙

## 3.1 먼저 게임을 완성하고 디자인은 나중에 입힌다

현재 3D asset은 하나도 없다.

따라서 외부 3D asset을 기다리지 말고 PlayCanvas의 primitive geometry를 이용하여 모든 것을 생성한다.

사용 가능한 기본 geometry:

- Sphere
- Box
- Cylinder
- Plane
- Capsule
- Cone

처음에는 모두 primitive + material만 사용한다.

게임이 재미있게 작동하는 것이 확인된 후에만 외부 3D asset을 추가할 수 있도록 구조를 만든다.

---

## 3.2 물리와 게임 규칙을 분리한다

매우 중요하다.

Physics simulation이 게임 결과를 직접 결정하도록 모든 것을 설계하지 않는다.

다음 두 시스템을 분리한다.

### Physics Layer

실제로 구슬이 움직이는 시스템.

- gravity
- velocity
- collision
- friction
- restitution
- impulse
- rigidbody
- collision detection

### Game Logic Layer

게임의 규칙과 결과를 관리한다.

- 참가자
- 구슬 ID
- 출발
- 결승선
- 도착 순서
- 순위
- 게임 상태
- 랜덤 seed
- 결과

게임 로직은 physics implementation에 강하게 결합하지 않는다.

---

# 4. 게임 화면

기본 게임 보드는 세로로 긴 3D 레이스 보드다.

카메라는 보드를 약간 위에서 내려다보는 perspective camera를 사용한다.

정면에서 단순히 바라보는 2D 느낌이 아니라 실제 깊이가 느껴지는 3D 게임처럼 보이게 한다.

예상 구조:

```text
                    CAMERA
                       ↓

        ┌─────────────────────────┐
        │                         │
        │   ●   ●   ●   ●   ●    │
        │   │   │   │   │   │    │
        │    ╲  │ ╱    │  ╱      │
        │     ╲ │╱     │ ╱       │
        │      ◇       ◇         │
        │    ╱   ╲   ╱   ╲       │
        │   │     ╲ ╱     │      │
        │   ├───┐     ┌───┤      │
        │       │     │          │
        │    ◇     ◇     ◇       │
        │   ╱ ╲   ╱ ╲   ╱ ╲      │
        │  ╱   ╲ ╱   ╲ ╱   ╲     │
        │                         │
        │       FINISH            │
        └─────────────────────────┘
```

실제 디자인은 위 구조를 기반으로 자유롭게 개선한다.

---

# 5. Marble

각 참가자는 하나의 marble을 가진다.

Marble은:

- Sphere render
- Dynamic rigidbody
- Sphere collision
- mass
- friction
- restitution
- linear damping
- angular damping

을 가진다.

각 marble에는 고유 ID를 부여한다.

예:

```text
marble-01
marble-02
marble-03
...
marble-10
```

각 marble은 참가자 이름 또는 번호와 연결된다.

---

# 6. 기본 게임 설정

초기 prototype은 **10개의 marble**을 사용한다.

게임 시작 시:

```text
10명의 참가자
↓
10개의 marble
↓
동일한 출발선
↓
동시에 출발
↓
장애물 통과
↓
FINISH
↓
도착 순서 기록
```

최대 참가자 수는 configuration으로 변경 가능하게 만든다.

예:

```ts
GAME_CONFIG.maxPlayers = 10
```

나중에 2~100명 등으로 변경할 수 있는 구조를 유지한다.

---

# 7. Race Track

Track은 다음 요소들로 구성한다.

### Start Area

marble이 동시에 출발하는 영역.

### Main Track

세로 방향으로 길게 구성한다.

### Obstacles

다양한 장애물을 사용한다.

최소 다음 종류를 구현한다.

1. Static bumper
2. Slanted wall
3. Vertical wall
4. Narrow passage
5. Splitter
6. Funnel
7. Rotating obstacle
8. Random deflector

각 장애물은 독립적인 TypeScript component로 구현한다.

예:

```text
Bumper
RotatingObstacle
Splitter
Funnel
Deflector
FinishTrigger
```

---

# 8. 랜덤성

이 게임에서 랜덤성은 매우 중요하다.

그러나 단순히 `Math.random()`을 곳곳에서 사용하는 구조로 만들지 않는다.

전용 RandomManager를 만든다.

```ts
RandomManager
```

seed를 지원해야 한다.

예:

```ts
RandomManager.setSeed(seed)
```

동일한 seed로 실행하면 가능한 한 동일한 초기 조건과 랜덤 이벤트를 재현할 수 있도록 한다.

목적:

- 디버깅
- 게임 replay
- 결과 검증
- 테스트
- 서버 authoritative result와의 연계 가능성

---

# 9. 공정성

게임 결과는 플레이어가 임의로 조작할 수 없어야 한다.

특히 향후 온라인 서비스로 확장할 것을 고려하여 다음 구조를 유지한다.

```text
Game Seed
     ↓
Race Configuration
     ↓
Physics Simulation
     ↓
Finish Order
```

게임 결과를 나중에 서버에서 검증할 수 있도록 게임 결과에 seed를 포함한다.

예:

```ts
interface RaceResult {
  seed: number
  startedAt: number
  finishOrder: string[]
  duration: number
}
```

현재 prototype에서는 client-side simulation으로 구현한다.

향후 server-side result generation 또는 authoritative server로 변경할 수 있도록 Game Logic과 Rendering/Physics를 분리한다.

---

# 10. Finish Detection

보드 하단에 Finish Zone을 만든다.

각 marble이 Finish Zone에 진입하면:

```text
1번째 marble → rank 1
2번째 marble → rank 2
3번째 marble → rank 3
...
```

Finish event는 반드시 한 번만 처리한다.

예:

```ts
RankingManager.onMarbleFinished(marbleId)
```

이미 finish 처리된 marble이 다시 trigger를 발생시켜도 순위가 중복 기록되지 않아야 한다.

---

# 11. Game State

명확한 state machine을 사용한다.

```text
IDLE
  ↓
READY
  ↓
COUNTDOWN
  ↓
RACING
  ↓
FINISHED
  ↓
RESULT
```

각 상태를 명확하게 분리한다.

예:

```ts
enum GameState {
  IDLE,
  READY,
  COUNTDOWN,
  RACING,
  FINISHED,
  RESULT,
}
```

---

# 12. 시작 연출

게임 시작 시:

```text
READY

3

2

1

GO!
```

연출을 추가한다.

GO 순간 모든 marble에 출발 impulse를 주거나 start gate를 열어서 동시에 출발하도록 한다.

---

# 13. 카메라

카메라는 단순히 고정된 한 화면으로 만들지 않는다.

최소 다음 기능을 구현한다.

### Overview Camera

전체 레이스 보드를 보여준다.

### Race Camera

현재 진행 중인 marble들을 따라간다.

### Finish Camera

결승선 근처의 상황을 강조한다.

### Result Camera

최종 결과를 보여준다.

카메라 전환은 부드러운 interpolation을 사용한다.

---

# 14. 재미있는 관전 연출

게임의 핵심은 플레이어가 직접 조작하는 것이 아니라 **결과를 관전하는 재미**다.

따라서 다음 연출을 적극적으로 사용한다.

- camera zoom
- camera follow
- camera shake
- slow motion
- finish line close-up
- particle effect
- bounce effect
- sound effect
- countdown
- finish highlight
- rank reveal

단, 과도한 효과로 인해 게임의 실제 결과가 보이지 않게 만들지 않는다.

---

# 15. UI

게임 화면에는 다음 UI를 만든다.

상단:

```text
MARBLE RACE
```

중앙:

3D game canvas

하단:

```text
10 PLAYERS
```

게임 종료 후:

```text
RESULT

🥇  PLAYER 04
🥈  PLAYER 09
🥉  PLAYER 02

4. PLAYER 07
5. PLAYER 01
...
```

HTML/CSS UI를 사용한다.

3D canvas 내부에 UI를 억지로 구현하지 않는다.

---

# 16. 참가자 표시

각 marble은 서로 명확하게 구분되어야 한다.

초기 prototype에서는 다음 방법을 사용한다.

- 서로 다른 material color
- marble 위에 작은 player number
- 필요하면 HTML overlay

예:

```text
🔴 01
🔵 02
🟢 03
🟡 04
...
```

나중에 실제 player avatar 또는 custom texture로 교체할 수 있도록 한다.

---

# 17. 물리 설정

초기값을 하드코딩하지 말고 configuration으로 관리한다.

예:

```ts
interface PhysicsConfig {
  gravity: number
  marbleMass: number
  marbleRadius: number
  friction: number
  restitution: number
  linearDamping: number
  angularDamping: number
}
```

초기값은 현실 물리보다 **게임으로서 재미있는 값**을 우선한다.

특히 marble이 너무 빨리 떨어지거나 너무 많이 튕겨서 결과를 관찰하기 어려운 경우를 피한다.

---

# 18. Fixed timestep

Physics simulation은 가능하면 안정적인 fixed timestep을 사용한다.

프레임레이트가 달라져도 게임 결과가 지나치게 달라지지 않도록 한다.

특히:

```text
60 FPS
120 FPS
30 FPS
```

환경에서 물리 결과가 크게 달라지는 문제가 없는지 테스트한다.

---

# 19. 성능

웹 게임이므로 성능을 중요하게 생각한다.

목표:

- desktop Chrome에서 60 FPS
- 10~50 marble에서 안정적인 simulation
- 불필요한 physics collider 최소화
- 복잡한 mesh collider 사용 최소화
- primitive collider 우선
- texture 크기 최소화
- asset lazy loading
- physics engine lazy loading 가능하면 적용

Physics collider는 rendering mesh와 분리한다.

예를 들어 복잡한 bumper mesh를 사용하더라도 physics에는 cylinder 또는 sphere collider를 사용한다.

---

# 20. Asset 없는 상태에서의 디자인

첫 번째 버전에서는 외부 asset을 다운로드하지 않는다.

다음만 사용한다.

- primitive geometry
- procedural material
- basic lighting
- particle
- CSS UI

목표는 **asset 없이도 게임처럼 보이는 prototype**이다.

스타일은 다음 방향을 기본으로 한다.

- clean
- colorful
- arcade
- playful
- modern
- polished

단순 개발자 테스트 화면처럼 보이지 않게 한다.

---

# 21. Lighting

기본적으로 다음을 사용한다.

- ambient/environment lighting
- directional light
- 필요하면 point light
- soft shadow

공은 glossy material을 사용하여 3D 느낌을 강조한다.

금속/플라스틱 장애물은 서로 다른 roughness를 사용한다.

---

# 22. 사운드 구조

초기에는 실제 음원 asset이 없어도 된다.

하지만 SoundManager를 만들어서 나중에 쉽게 교체할 수 있도록 한다.

예:

```ts
SoundManager.play('countdown')
SoundManager.play('marble-bounce')
SoundManager.play('finish')
SoundManager.play('result')
```

실제 audio asset이 없으면 개발 중에는 graceful fallback을 사용한다.

---

# 23. 코드 구조

다음과 같은 구조를 선호한다.

```text
src/
  core/
    Game.ts
    GameState.ts
    GameConfig.ts

  physics/
    PhysicsWorld.ts
    PhysicsConfig.ts

  marble/
    Marble.ts
    MarbleManager.ts
    MarbleConfig.ts

  track/
    Track.ts
    Bumper.ts
    Splitter.ts
    Funnel.ts
    RotatingObstacle.ts
    Deflector.ts
    FinishZone.ts

  race/
    RaceManager.ts
    RankingManager.ts
    RandomManager.ts
    RaceResult.ts

  camera/
    CameraManager.ts

  audio/
    SoundManager.ts

  ui/
    GameUI.ts
    CountdownUI.ts
    ResultUI.ts

  main.ts
```

실제 구조는 프로젝트에 맞게 개선할 수 있다.

---

# 24. 절대 하지 말아야 할 것

다음과 같은 방식으로 구현하지 않는다.

### 나쁜 예

```text
main.ts
  └── 모든 게임 코드
```

하나의 거대한 파일에 모든 코드를 넣지 않는다.

또한:

- magic number 남발 금지
- 전역 변수 남발 금지
- physics와 UI 강결합 금지
- rendering과 ranking logic 강결합 금지
- Math.random() 무분별한 사용 금지
- 복잡한 mesh collider 남용 금지
- 외부 asset을 먼저 찾느라 prototype을 지연시키지 말 것

---

# 25. 개발 단계

한 번에 완성품을 만들려고 하지 않는다.

## Phase 1 — Boot

다음만 구현한다.

- Vite
- TypeScript
- PlayCanvas
- canvas
- camera
- light
- ground

그리고 브라우저에서 실행되는지 확인한다.

---

## Phase 2 — One Marble

공 하나를 만든다.

```text
Sphere
+
RigidBody
+
Sphere Collision
+
Gravity
```

공이 바닥으로 떨어지는 것을 확인한다.

---

## Phase 3 — Track

다음을 만든다.

- wall
- bumper
- slope
- funnel

공이 정상적으로 충돌하고 이동하는지 확인한다.

---

## Phase 4 — Multiple Marbles

10개의 marble을 생성한다.

각 marble에:

```text
ID
Color
Player Name
```

을 연결한다.

---

## Phase 5 — Finish Ranking

Finish Zone을 만들고 도착 순서를 기록한다.

예:

```text
PLAYER 07
PLAYER 03
PLAYER 09
PLAYER 01
...
```

---

## Phase 6 — Random Track

Splitter / Deflector / Rotating obstacle 등을 추가한다.

게임마다 다른 경로가 나오도록 한다.

---

## Phase 7 — Camera

관전용 camera system을 구현한다.

---

## Phase 8 — UI

Countdown / Ranking / Result UI를 추가한다.

---

## Phase 9 — Polish

다음 순서로 개선한다.

1. lighting
2. materials
3. particle
4. animation
5. sound
6. camera
7. UI
8. performance

---

# 26. 테스트

다음 테스트를 반드시 수행한다.

### Basic physics

- marble이 바닥을 통과하지 않는가?
- wall을 통과하지 않는가?
- bumper에서 정상적으로 튕기는가?

### Ranking

- Finish 순서가 정확한가?
- 동일 marble이 두 번 finish되지 않는가?
- 모든 marble이 finish되지 않는 경우 timeout 처리가 있는가?

### Random

- seed가 변경되면 결과가 다양해지는가?
- 같은 seed로 반복하면 결과가 재현 가능한가?

### Performance

10개 marble

25개 marble

50개 marble

100개 marble

에서 성능을 확인한다.

100개에서 성능이 낮아지더라도 10~50개에서 정상적인 게임 경험을 제공하는 것을 우선한다.

---

# 27. 중요한 게임 디자인 원칙

이 게임은 "현실적으로 정확한 물리 시뮬레이터"가 아니다.

목표는:

> "누가 이길지 끝까지 보고 싶게 만드는 것"

이다.

따라서 실제 물리와 약간 다른 설정을 사용해도 된다.

예:

- restitution을 높인다.
- 특정 bumper의 반발력을 높인다.
- 특정 구간에서 속도를 늦춘다.
- finish 직전에 좁은 통로를 만든다.
- marble 간 충돌을 적절히 조정한다.

하지만 결과를 의도적으로 특정 player에게 유리하게 만드는 식의 hidden bias는 넣지 않는다.

---

# 28. 최종 목표

최종 prototype을 실행하면 사용자는 별도의 설명 없이 다음 흐름을 이해할 수 있어야 한다.

```text
게임 화면 진입
        ↓
10개의 marble 등장
        ↓
3
2
1
GO!
        ↓
marble들이 서로 다른 경로로 진행
        ↓
누가 먼저 도착할지 관전
        ↓
Finish
        ↓
순위 표시
```

게임을 처음 보는 사람도 5초 안에 게임의 목적을 이해할 수 있어야 한다.

---

# 29. Claude Code 작업 방식

작업을 시작하기 전에 현재 디렉토리를 검사한다.

이미 프로젝트가 존재한다면 기존 파일을 함부로 삭제하지 않는다.

먼저:

1. 현재 프로젝트 구조 확인
2. package.json 확인
3. 기존 dependency 확인
4. 실행 방법 확인
5. README 확인

그 후 구현 계획을 세운다.

계획을 먼저 설명하고 기다리지 말고, 합리적으로 판단하여 실제 구현까지 진행한다.

단, 기존 코드와 충돌하거나 중요한 architectural decision이 필요한 경우에는 현재 구조를 최대한 보존하면서 가장 작은 변경으로 해결한다.

각 Phase가 끝날 때마다 실제로 실행 가능한 상태를 유지한다.

---

# 30. 완료 조건

첫 번째 milestone의 완료 조건은 다음과 같다.

브라우저에서 게임을 실행했을 때:

1. 3D game board가 보인다.
2. 10개의 서로 다른 marble이 보인다.
3. COUNTDOWN이 실행된다.
4. marble들이 동시에 출발한다.
5. 장애물과 충돌한다.
6. 서로 다른 경로로 이동한다.
7. Finish Zone에 도착한다.
8. 도착 순서가 기록된다.
9. 결과 화면이 표시된다.
10. RESET 버튼으로 다시 게임을 시작할 수 있다.

**이 10개가 완전히 작동하는 것이 첫 번째 목표다.**

화려한 그래픽보다 이 기능을 먼저 완성한다.

---

# 31. 추가 지시

코드를 작성할 때 단순히 "동작하는 코드"만 만들지 말고 이후 실제 서비스에 확장할 수 있는 구조로 만든다.

향후 추가될 가능성이 있는 기능:

- player 이름 입력
- player avatar
- 방 생성
- multiplayer
- server authoritative result
- replay
- ranking
- betting 또는 prediction
- 여러 종류의 race track
- track editor
- game seed 공유
- 게임 결과 URL 공유

따라서 핵심 Game Logic을 UI나 PlayCanvas scene에 과도하게 결합하지 않는다.

---

## 최종 지시

**먼저 Phase 1부터 구현하고 실제 브라우저에서 실행되는 것을 확인한다.**

그 다음 Phase 2 → Phase 3 → Phase 4 순서로 진행한다.

각 단계에서 기존 기능이 깨지지 않는지 확인하면서 점진적으로 완성한다.

최종적으로는 "개발자용 physics demo"가 아니라 실제 사용자에게 보여줄 수 있는 **polished 3D Marble Race prototype**을 만드는 것이 목표다.
