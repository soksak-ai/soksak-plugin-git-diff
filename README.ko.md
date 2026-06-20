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

## 권한 근거

| 권한 | 사용처 |
|------|--------|
| `ui` | `registerView` 로 뷰 등록(사이드바/콘텐츠 배치) |
| `commands` | `explorer.git` 명령 실행(변경 파일 목록 조회) |
| `git:read` | `app.git.diff` 로 unified diff 조회(읽기 전용) |

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
