# 깃 변경 (soksak-plugin-git-diff)

프로젝트의 git 변경 파일 목록을 보여주고, 파일을 클릭하면 unified diff 를
줄 단위 착색(추가 +, 삭제 -, hunk @@)으로 렌더하는 뷰 플러그인입니다.
상단 바의 `staged` 체크박스로 작업트리 diff 와 index(`--cached`) diff 를 전환합니다.

## 무엇

- 우측 사이드바(기본) 또는 콘텐츠 영역에 "깃 변경" 뷰(아이콘 `±`)를 띄웁니다.
- 변경 파일 목록: 상태 배지(M 수정 / A 추가 / D 삭제 / R 이름변경 / ? 미추적) + 경로.
- 파일 클릭 → unified diff. `+` 줄 초록(`var(--ok)`), `-` 줄 빨강, `@@` 줄 강조색.
- `⟳` 버튼으로 새로고침, `staged` 토글로 index diff 전환. 변경이 없으면 "변경 없음".
- 실패(비 git 디렉토리, 루트 없음 등)는 뷰 안에 에러 텍스트로 표시됩니다.
- 뷰가 보여주는 데이터를 헤드리스 명령으로도 노출합니다: `files`(변경 파일 목록) / `read`(diff 본문).

## 명령

뷰가 보여주는 모든 데이터는 뷰 없이도 읽을 수 있습니다(에이전트/CLI/MCP 표면).

| 명령 | 파라미터 | 반환 |
|------|--------|------|
| `plugin.soksak-plugin-git-diff.files` | `path?`(저장소 경로, 생략 시 활성 프로젝트 루트) | `{ files: [{path,status}] }` — 뷰의 파일 목록과 동일 소스 |
| `plugin.soksak-plugin-git-diff.read` | `path?`, `file?`(저장소 상대 경로, 생략 시 저장소 전체), `staged?`(기본 false) | `{ diff, file?, staged }` — 뷰의 diff 영역과 동일 소스 |

```sh
sok plugin.soksak-plugin-git-diff.files
sok plugin.soksak-plugin-git-diff.read '{"file":"src/main.ts","staged":true}'
```

응답은 표준 봉투(`{ok, code, message, data}`)를 따르며, 실패는 제공자의 에러 코드를
그대로 전파합니다(예: `path` 도 활성 프로젝트도 없으면 `NO_PATH`).

## git 제공자

이 플러그인은 git 을 실행하지 않습니다. `status`·`diff` 를 **`soksak-git-spec@1`** 구현체에
위임하며, 그 구현체를 **계약으로 찾습니다 — 이름으로 찾지 않습니다**(`plugin.implementers` →
활성 구현체). 구현체가 바뀌어도 이 플러그인은 그대로입니다. 활성 구현체가 없으면 loud 하게
거부합니다(`NO_GIT_PROVIDER`) — 빈 목록으로 답하지 않습니다(빈 목록은 "변경 없음"으로 읽힙니다).

매니페스트는 `consumes: ["soksak-git-spec@1"]` 를 선언한다 — 계약-핀의 소비자 축이다. 호스트의 호출
게이트가 그 선언을 읽으므로 **이 플러그인 어디에도 구현체의 플러그인 id 가 없다**: 코드에도, 매니페스트에도.

## 테스트

```sh
npm test   # node --test — 매니페스트≡실등록 conformance, spec 필드, 봉투 동작
```

## 권한 근거

| 권한 | 사용처 |
|------|--------|
| `ui` | `registerView` 로 뷰 등록(사이드바/콘텐츠 배치) |
| `commands` | 제공자의 `status`·`diff` 실행 + `files`·`read` 명령 등록 |
| `terminal` | 뷰가 저장소 디렉토리 컨텍스트를 여는 데 사용 |

쓰기 권한 없음 — git 에 어떤 변경도 가하지 않습니다.

## 설치

```sh
# 로컬 디렉토리에서 설치
sok plugin.install '{"source":"/path/to/examples/plugins/soksak-plugin-git-diff"}'
```

설치 후 앱의 플러그인 설정에서 활성화(동의)하면 우측 사이드바 아이콘 레일에
`±` 아이콘이 나타납니다. 활성화 동의는 앱 안에서 사람이 직접 해야 합니다.

## 사용법

1. 우측 사이드바의 `±` 아이콘을 눌러 뷰를 엽니다(콘텐츠 영역 배치도 지원).
2. 변경 파일 목록에서 파일을 클릭하면 아래에 diff 가 표시됩니다.
3. `staged` 를 체크하면 index(스테이징)된 변경의 diff 를 보여줍니다.
4. `⟳` 로 목록과 diff 를 다시 불러옵니다.

## DOM 노출 (구조적 주소)

호스트는 임의 CSS selector 가 아닌 구조적 path 주소로 이 뷰의 요소에 접근합니다
(`win/<label>/<region>/view/soksak-plugin-git-diff.view/node/<nodePath>`). 아래 노드만
노출되며(매니페스트 `contributes.nodes` 선언 = 동의 화면 표기), 그 외 요소는 접근 불가입니다.

| 노드 | data-node | 설명 |
|------|-----------|------|
| 파일 행 | `file/<경로>` | 변경 파일 행 — 클릭 시 diff 표시. 안정키 = 파일 경로(소문자화·허용 외 문자는 `-` 치환). |
| staged | `staged` | staged 체크박스 — 작업트리 diff ↔ index(`--cached`) diff 토글. |
| 새로고침 | `refresh` | 새로고침 버튼 — 목록과 diff 재로드. |
