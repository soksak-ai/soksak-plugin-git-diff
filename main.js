// 깃 변경 — 변경 파일 목록 + 클릭 시 unified diff 뷰어 (soksak-plugin-spec v1).
// 권한 근거: ui(뷰 등록) / commands(git 제공자의 status·diff 실행 + files/read 명령 등록).
// 외부 데이터(경로/디프 본문)는 전부 textContent 로만 삽입 — innerHTML 미사용.
// 명령 표면(C2 투명성): 뷰가 보여주는 데이터(변경 파일 목록·diff 본문)를 헤드리스로도 반환한다.
//
// git 은 직접 실행하지 않는다. soksak-spec-plugin-git 을 구현한 플러그인에게 위임하고, 그 플러그인은
// **계약으로 찾는다 — 이름으로 찾지 않는다**(C3 L2 계약-핀). 구현체가 바뀌어도 이 파일은 그대로다.
const GIT_CONTRACT = "soksak-spec-plugin-git";

// 계약 구현체 해소 — 매번 다시 묻는다(구현체는 런타임에 켜지고 꺼진다. 캐시는 그 사실과 어긋난다).
// 없으면 null → 호출자는 loud 하게 거부한다(조용한 빈 목록은 "변경 없음"으로 읽혀 더 나쁘다).
async function gitProvider(app) {
  const out = await app.commands.execute("plugin.implementers", { id: GIT_CONTRACT });
  if (!out?.ok) return null;
  const found = (out.data?.implementers ?? []).find((i) => i.status === "enabled");
  return found?.id ?? null;
}

const noProvider = (msg) => ({
  ok: false,
  code: "NO_GIT_PROVIDER",
  message: msg(
    `no enabled plugin implements ${GIT_CONTRACT}`,
    `${GIT_CONTRACT} 을 구현한 활성 플러그인이 없습니다`,
  ),
});

// 제공자 명령 호출 — 계약이 정한 이름으로 부른다(status·diff 는 계약 표면이다).
async function callGit(app, cmd, params, msg) {
  const id = await gitProvider(app);
  if (!id) return noProvider(msg);
  return app.commands.execute(`plugin.${id}.${cmd}`, params);
}

// 계약 status 위임 → 변경 파일 목록. 성공이면 data.entries 를 뷰·명령이 쓰는 {path, status} 로
// 사상한다(untracked 디렉토리의 후행 슬래시는 트리 노드와 맞추려 제거). 실패면 봉투를 그대로
// 전파한다(침묵 실패 금지).
async function gitFiles(app, path, msg) {
  const out = await callGit(app, "status", path ? { path } : {}, msg);
  if (!out.ok) return out;
  const entries = (out.data?.entries ?? []).map((e) => ({
    path: String(e.path).replace(/\/+$/, ""),
    status: e.status,
  }));
  return { ok: true, entries };
}

// 계약 diff 위임 → { ok, data:{ diff } } 봉투. 호출자가 봉투를 해석한다.
function gitDiff(app, { path, file, staged }, msg) {
  return callGit(
    app,
    "diff",
    {
      ...(path ? { path } : {}),
      ...(file ? { file } : {}),
      staged: staged === true,
    },
    msg,
  );
}

// 계약 status 의 status 문자열 → 배지 글자/색
const STATUS = {
  modified: { ch: "M", color: "var(--acc)" },
  added: { ch: "A", color: "var(--ok)" },
  deleted: { ch: "D", color: "#e5534b" },
  renamed: { ch: "R", color: "var(--fg2)" },
  untracked: { ch: "?", color: "var(--fg3)" },
};

// 요소 생성 헬퍼 — text 는 textContent 로만(이스케이프 보장)
function h(tag, style, text) {
  const el = document.createElement(tag);
  if (style) el.style.cssText = style;
  if (text !== undefined) el.textContent = text;
  return el;
}

// 파일 경로 → data-node 안정키 세그먼트. 경로 자체가 안정 식별자(카운터 금지)지만
// node path 세그먼트 형식(^[a-z0-9][a-z0-9.-]*$)을 지켜야 하므로 소문자화 + 허용
// 외 문자(슬래시·공백·언더스코어 등)를 "-" 로 치환, 선두를 [a-z0-9] 로 보정한다.
function nodeKey(path) {
  const k = path.toLowerCase().replace(/[^a-z0-9.-]+/g, "-");
  return /^[a-z0-9]/.test(k) ? k : "f-" + k;
}

// diff 한 줄의 착색 규칙
function lineStyle(line) {
  if (line.startsWith("@@")) return "color:var(--acc);opacity:.7";
  if (line.startsWith("+")) return "color:var(--ok)";
  if (line.startsWith("-")) return "color:#e5534b";
  return "color:var(--fg2)";
}

// 뷰 status 축(C2 투명성) — 파일 목록 로드 결과를 뷰 status{code,message} 로 사상한다.
// outcome.kind: loading(조회 중) / clean(변경 0) / changed(변경 N) / error(조회 실패).
// 이 뷰는 읽기 전용 diff 뷰어라 코어 blocking 어휘(dirty·busy·running)에 해당하는 상태가
// 없다 — 전부 표시 전용 code 다(닫기 가드 미발동). message 는 locale 해소(msg 주입, 사람표면
// {en,ko}). 미지 kind 는 null(억지 상태 금지). 순수함수 — 테스트 seam.
export function deriveViewStatus(outcome, msg) {
  switch (outcome.kind) {
    case "loading":
      return { code: "loading", message: msg("Loading…", "불러오는 중…") };
    case "clean":
      return { code: "clean", message: msg("No changes", "변경 없음") };
    case "changed":
      return {
        code: "changed",
        message: msg(`${outcome.count} changed`, `변경 ${outcome.count}개`),
      };
    case "error":
      return { code: "error", message: outcome.message };
    default:
      return null;
  }
}

export default {
  activate(ctx) {
    const app = ctx.app;
    // mount 별 정리 함수(이벤트 구독 등) — unmount 에서 실행.
    const cleanups = new Map();

    // ── 명령 표면 — 뷰와 같은 소스(explorer.git / app.git.diff)의 헤드리스 등가 ──
    const reg = (name, spec) => ctx.subscriptions.push(app.commands.register(name, spec));
    const err = (code, message) => ({ ok: false, code, message });
    // message 는 locale 해소(사람표면 {en,ko} — docs/I18N.md). ko 외 locale 은 en 폴백.
    const msg = (en, ko) => ((typeof app.locale === "function" ? app.locale() : "ko") === "ko" ? ko : en);

    reg("files", {
      description:
        "List changed files with per-file git status (modified/added/deleted/renamed/untracked) — the same data the view's file list shows. A directory that is not a git repository yields an empty list.",
      triggers: { ko: "깃 변경 파일 목록 조회" },
      params: {
        path: { type: "string", description: "Repository path (defaults to active project root when omitted)" },
      },
      returns: "{ files: [{path,status}] }",
      message: (d) =>
        msg(`Found ${(d.files ?? []).length} changed file(s).`, `변경 파일 ${(d.files ?? []).length}개를 찾았습니다.`),
      examples: [
        "sok plugin.soksak-plugin-git-diff.files",
        'sok plugin.soksak-plugin-git-diff.files \'{"path":"/Users/me/work"}\'',
      ],
      hint: (d) =>
        d.ok && (d.files ?? []).length > 0
          ? [{ cmd: "plugin.soksak-plugin-git-diff.read", why: "파일별 unified diff 본문을 볼 수 있습니다" }]
          : [],
      handler: async (p) => {
        const out = await gitFiles(app, typeof p.path === "string" && p.path ? p.path : undefined, msg);
        if (!out.ok) return err(out.code, out.message); // 소스 실패 봉투 전파(침묵 실패 금지)
        return { ok: true, files: out.entries };
      },
    });

    reg("read", {
      description:
        "Return the raw unified diff — the whole repository by default, one file when file is given, the index instead of the working tree when staged=true. The same text the view's diff pane shows.",
      triggers: { ko: "깃 diff 본문 변경 내용 조회 스테이지" },
      params: {
        path: { type: "string", description: "Repository path (defaults to active project root when omitted)" },
        file: { type: "string", description: "Limit diff to this file (repository-relative path)" },
        staged: { type: "boolean", description: "Diff the index (staged changes) instead of the working tree", default: false },
      },
      returns: "{ diff: string, file?, staged }",
      message: (d) =>
        String(d.diff ?? "").trim()
          ? msg("Returned the unified diff.", "unified diff 를 반환했습니다.")
          : msg("No changes.", "변경이 없습니다."),
      examples: [
        "sok plugin.soksak-plugin-git-diff.read",
        'sok plugin.soksak-plugin-git-diff.read \'{"file":"src/main.ts","staged":true}\'',
      ],
      handler: async (p) => {
        const file = typeof p.file === "string" && p.file ? p.file : undefined;
        const staged = p.staged === true;
        const out = await gitDiff(
          app,
          { path: typeof p.path === "string" && p.path ? p.path : undefined, file, staged },
          msg,
        );
        if (!out.ok) return err(out.code, out.message); // 소스 실패 봉투 전파(침묵 실패 금지)
        return { ok: true, diff: out.data?.diff ?? "", ...(file ? { file } : {}), staged };
      },
    });

    ctx.subscriptions.push(
      app.ui.registerView("view", {
        mount(container, vctx) {
          // mount 단위 closure 상태 — sidebar/content 동시 배치에도 독립 동작
          const root = vctx.root;
          let staged = false;
          let selected = null; // 선택된 파일 경로(root 상대)
          const rows = new Map(); // path → 행 요소(선택 하이라이트용)

          // 뷰 status 축(C2) — 이 뷰의 실제 상태(로딩·변경유무·오류)를 호스트에 push 보고.
          // 회수는 뷰 종속(코어가 뷰 소멸 시 status 삭제) — unmount 별도 정리 불필요.
          const report = (outcome) => vctx.setStatus?.(deriveViewStatus(outcome, msg));

          container.replaceChildren();
          const wrap = h(
            "div",
            "display:flex;flex-direction:column;height:100%;min-height:0;font-size:12px;color:var(--fg);background:var(--bg)",
          );

          // ── 상단 바(표준 골격: 정보/컨트롤 좌 · 액션 우, border-bottom)
          const bar = h(
            "div",
            "display:flex;align-items:center;justify-content:space-between;gap:10px;" +
              "padding:4px 10px;border-bottom:1px solid var(--bd);flex:0 0 auto;" +
              "min-height:28px;box-sizing:border-box",
          );
          // 새로고침 아이콘 — 호스트 표준(앱 크롬과 동일한 lucide refresh, 정적
          // 신뢰 마크업이라 innerHTML 안전). 텍스트 글리프(⟳) 크기 불일치 제거.
          const refreshBtn = h(
            "button",
            "display:inline-flex;align-items:center;justify-content:center;" +
              "width:24px;height:22px;padding:0;cursor:pointer;" +
              "border:1px solid var(--bd);background:var(--inset);color:var(--fg2);border-radius:4px",
          );
          refreshBtn.innerHTML =
            '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" ' +
            'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>' +
            '<path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>';
          refreshBtn.title = "새로고침";
          refreshBtn.dataset.node = "refresh"; // 구조적 주소 노출(클릭=재로드)
          const stagedLabel = h(
            "label",
            "display:flex;align-items:center;gap:5px;cursor:pointer;color:var(--fg2);user-select:none",
          );
          const stagedBox = document.createElement("input");
          stagedBox.type = "checkbox";
          stagedBox.style.cssText = "accent-color:var(--acc);margin:0";
          stagedBox.dataset.node = "staged"; // 구조적 주소 노출(토글=working↔index)
          stagedLabel.append(stagedBox, document.createTextNode("staged"));
          bar.append(stagedLabel, refreshBtn);

          // ── 에러 표시(침묵 실패 금지) / 파일 목록 / diff 영역.
          // 에러 시 목록/디프를 숨겨 빈 칸(잔여 보더)이 남지 않게 한다.
          const errEl = h(
            "div",
            "display:none;padding:8px 10px;color:#e5534b;font-size:11px;" +
              "white-space:pre-wrap;word-break:break-all;flex:0 0 auto",
          );
          const listEl = h(
            "div",
            "flex:0 1 auto;max-height:45%;overflow:auto;padding:5px 0",
          );
          const diffEl = h(
            "div",
            "flex:1 1 auto;min-height:0;overflow:auto;padding:8px 10px;" +
              "border-top:1px solid var(--bd);" +
              "font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;line-height:1.5;white-space:pre",
          );

          wrap.append(bar, errEl, listEl, diffEl);
          container.append(wrap);

          const showError = (e) => {
            const text = String(e && e.message ? e.message : e);
            errEl.textContent = text;
            errEl.style.display = "block";
            listEl.style.display = "none";
            diffEl.style.display = "none";
            report({ kind: "error", message: text }); // 조회 오류 상태 보고
          };
          const clearError = () => {
            errEl.style.display = "none";
            listEl.style.display = "";
            diffEl.style.display = "";
          };
          const highlight = () => {
            for (const [path, row] of rows) {
              row.style.background = path === selected ? "var(--inset)" : "";
            }
          };

          // 선택 파일의 unified diff 렌더 — 줄 단위 착색, 전부 textContent
          async function loadDiff() {
            diffEl.replaceChildren();
            if (!selected) return;
            const out = await gitDiff(app, { path: root, file: selected, staged }, msg);
            if (!out.ok) {
              showError(`${out.code}: ${out.message}`);
              return;
            }
            const text = out.data?.diff ?? "";
            if (!text.trim()) {
              diffEl.append(h("div", "color:var(--fg3)", "변경 없음"));
              return;
            }
            const frag = document.createDocumentFragment();
            for (const line of text.split("\n")) {
              frag.append(h("div", lineStyle(line), line === "" ? " " : line));
            }
            diffEl.append(frag);
          }

          // 변경 파일 목록 — git-core status 명령(파일트리 데코레이션과 동일 소스)
          async function loadList() {
            clearError();
            listEl.replaceChildren();
            rows.clear();
            report({ kind: "loading" }); // 조회 시작 — 정착 시 clean/changed/error 로 전이
            if (!root) {
              showError("프로젝트 루트 없음 — 폴더가 열린 프로젝트에서 사용하세요");
              return;
            }
            try {
              const out = await gitFiles(app, root, msg);
              if (!out.ok) {
                showError(`${out.code}: ${out.message}`);
                return;
              }
              const entries = out.entries || [];
              if (entries.length === 0) {
                listEl.append(h("div", "padding:4px 12px;color:var(--fg3)", "변경 없음"));
                report({ kind: "clean" }); // 변경 없음 상태 보고
                return;
              }
              report({ kind: "changed", count: entries.length }); // 변경 N개 상태 보고
              for (const ent of entries) {
                const st = STATUS[ent.status] || { ch: "·", color: "var(--fg3)" };
                const row = h(
                  "div",
                  "display:flex;align-items:center;gap:7px;padding:3px 12px;cursor:pointer",
                );
                row.title = ent.path;
                // 동적 목록 — 안정키=파일 경로(카운터 인덱스 금지). 클릭=diff 보기.
                row.dataset.node = `file/${nodeKey(ent.path)}`;
                const badge = h(
                  "span",
                  `flex:0 0 12px;text-align:center;font-weight:600;color:${st.color}`,
                  st.ch,
                );
                const pathEl = h(
                  "span",
                  "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--fg2)",
                  ent.path,
                );
                row.append(badge, pathEl);
                row.onclick = () => {
                  selected = ent.path;
                  highlight();
                  void loadDiff();
                };
                rows.set(ent.path, row);
                listEl.append(row);
              }
              highlight();
            } catch (e) {
              showError(e);
            }
          }

          refreshBtn.onclick = () => {
            void loadList();
            void loadDiff();
          };
          stagedBox.onchange = () => {
            staged = stagedBox.checked;
            void loadDiff(); // working tree ↔ index(--cached) 전환
          };

          void loadList();

          // 자동 갱신: 터미널 명령 종료 이벤트(OSC 탐지 기반 — 폴링 없음) →
          // 300ms 정착 후 재로드. 다른 프로젝트의 명령은 무시. ⟳ 는 수동 보조.
          let reloadTimer = null;
          const sub = app.events.on("command.finished", (e) => {
            if (e.projectId && vctx.projectId && e.projectId !== vctx.projectId)
              return;
            clearTimeout(reloadTimer);
            reloadTimer = setTimeout(() => {
              void loadList();
              void loadDiff();
            }, 300);
          });
          cleanups.set(container, () => {
            clearTimeout(reloadTimer);
            sub.dispose();
          });
        },

        unmount(container) {
          cleanups.get(container)?.();
          cleanups.delete(container);
          container.replaceChildren();
        },
      }),
    );
  },

  deactivate() {
    // 등록 자원은 호스트 tracker + ctx.subscriptions 가 자동 수거
  },
};
