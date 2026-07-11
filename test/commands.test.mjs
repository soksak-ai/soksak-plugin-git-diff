// 명령 표면 정합 테스트 — C2 투명성(기능 있는 플러그인은 커맨드를 노출한다)의 헤드리스 게이트.
// node --test 만으로 실행된다(앱·소켓·DOM 불요). 검사 축 3개:
//   ① 매니페스트 contributes.commands 가 비어 있지 않다(뷰가 보여주는 데이터의 헤드리스 등가).
//   ② 선언 ≡ 실등록 양방향(conformance) — activate() 가 등록한 이름 집합과 선언 집합이 일치한다.
//   ③ 각 명령 spec 은 description·examples·ko triggers·message 를 갖추고, 봉투 {ok,code,message}
//      규약(성공 ok:true / 실패 ok:false+code)을 지킨다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "..", "plugin.json"), "utf8"));
const FULL = (name) => `plugin.${manifest.id}.${name}`;

// activate() 를 mock 호스트로 구동 — 명령 등록을 포획하고 뷰 호스트는 스텁.
// overrides.execute = app.commands.execute 대역(git 라이브러리 플러그인 status/diff 커맨드를
// 여기로 부른다). 미지정이면 status 는 빈 목록, diff 는 빈 문자열 봉투를 돌려준다.
async function loadPlugin(overrides = {}) {
  const registered = new Map();
  const app = {
    locale: () => overrides.locale ?? "en",
    ui: { registerView: () => ({ dispose() {} }) },
    commands: {
      register: (name, spec) => {
        registered.set(name, spec);
        return { dispose() {} };
      },
      execute:
        overrides.execute ??
        (async (name) =>
          name === "plugin.soksak-plugin-git-core.diff"
            ? { ok: true, code: "OK", message: "", data: { diff: "" } }
            : { ok: true, code: "OK", message: "", data: { entries: [] } }),
    },
    events: { on: () => ({ dispose() {} }) },
  };
  const mod = (await import("../main.js")).default;
  mod.activate({ app, subscriptions: [] });
  return { registered };
}

// 등록된 spec 을 가져온다 — 없으면 그 자체가 실패(선언만 있고 미등록 = conformance 위반).
async function specOf(name, overrides) {
  const { registered } = await loadPlugin(overrides);
  const spec = registered.get(name);
  assert.ok(spec, `명령 미등록: ${name}`);
  return spec;
}

test("매니페스트가 명령 표면을 선언한다 (C2 — 명령 0 = 위반)", () => {
  const cmds = manifest.contributes?.commands;
  assert.ok(Array.isArray(cmds) && cmds.length > 0, "contributes.commands 가 비어 있음");
  for (const c of cmds) {
    assert.ok(typeof c.name === "string" && c.name.length > 0, "명령 name 누락");
    assert.ok(c.title?.en && c.title?.ko, `명령 ${c.name} title.{en,ko} 누락`);
  }
});

test("선언 ≡ 실등록 양방향 (conformance)", async () => {
  const declared = (manifest.contributes?.commands ?? []).map((c) => c.name).sort();
  const { registered } = await loadPlugin();
  const actual = [...registered.keys()].sort();
  assert.deepEqual(actual, declared);
});

test("전 명령 spec 에 description·examples·ko triggers·message 구비", async () => {
  const { registered } = await loadPlugin();
  assert.ok(registered.size > 0, "등록된 명령 0개");
  for (const [name, spec] of registered) {
    assert.ok(typeof spec.description === "string" && spec.description.length > 0, `${name}: description 누락`);
    assert.ok(Array.isArray(spec.examples) && spec.examples.length >= 1, `${name}: examples 누락`);
    assert.ok(typeof spec.triggers?.ko === "string" && spec.triggers.ko.length > 0, `${name}: ko triggers 누락`);
    assert.ok(typeof spec.message === "function", `${name}: message 누락`);
    assert.ok(typeof spec.handler === "function", `${name}: handler 누락`);
    for (const ex of spec.examples) assert.ok(ex.includes(FULL(name)), `${name}: example 이 전체 명령명을 담지 않음`);
  }
});

test("files: 변경 파일 목록을 ok 봉투로 반환 (뷰 목록과 동일 소스 git-core status)", async () => {
  // git-core status 는 porcelain v2 형태 {path,x,y,status,...} 를 data.entries 로 준다 —
  // files 는 {path,status} 만 뽑고 untracked 디렉토리의 후행 슬래시를 제거한다.
  const statusEntries = [
    { path: "src/a.ts", x: ".", y: "M", status: "modified" },
    { path: "docs/", x: "?", y: "?", status: "untracked" },
  ];
  const calls = [];
  const spec = await specOf("files", {
    execute: async (name, params) => {
      calls.push([name, params]);
      return { ok: true, code: "OK", message: "", data: { entries: statusEntries } };
    },
  });
  const res = await spec.handler({ path: "/repo" });
  assert.equal(res.ok, true);
  assert.deepEqual(res.files, [
    { path: "src/a.ts", status: "modified" },
    { path: "docs", status: "untracked" },
  ]);
  assert.deepEqual(calls, [["plugin.soksak-plugin-git-core.status", { path: "/repo" }]]);
  const m = spec.message(res);
  assert.ok(typeof m === "string" && m.length > 0, "message 가 문자열을 반환하지 않음");
});

test("files: path 생략 시 활성 프로젝트 루트 위임(파라미터 무전달)", async () => {
  const calls = [];
  const spec = await specOf("files", {
    execute: async (name, params) => {
      calls.push([name, params]);
      return { ok: true, code: "OK", message: "", data: { entries: [] } };
    },
  });
  const res = await spec.handler({});
  assert.equal(res.ok, true);
  assert.deepEqual(res.files, []);
  assert.equal(calls[0][0], "plugin.soksak-plugin-git-core.status");
  assert.deepEqual(calls[0][1], {}); // path 미지정은 그대로 위임 — git-core 가 활성 프로젝트로 해소
});

test("files: 소스 명령 실패 봉투를 code 보존으로 전파 (침묵 실패 금지)", async () => {
  const spec = await specOf("files", {
    execute: async () => ({ ok: false, code: "NO_PATH", message: "no project root — pass path" }),
  });
  const res = await spec.handler({});
  assert.equal(res.ok, false);
  assert.equal(res.code, "NO_PATH");
  assert.ok(typeof res.message === "string" && res.message.length > 0);
});

test("read: unified diff 본문을 반환하고 file/staged 를 에코 (git-core diff 위임)", async () => {
  const seen = [];
  const spec = await specOf("read", {
    execute: async (name, params) => {
      seen.push([name, params]);
      return { ok: true, code: "OK", message: "", data: { diff: "+added line" } };
    },
  });
  const res = await spec.handler({ path: "/repo", file: "src/a.ts", staged: true });
  assert.equal(res.ok, true);
  assert.equal(res.diff, "+added line");
  assert.equal(res.file, "src/a.ts");
  assert.equal(res.staged, true);
  assert.deepEqual(seen, [
    ["plugin.soksak-plugin-git-core.diff", { path: "/repo", file: "src/a.ts", staged: true }],
  ]);
  assert.ok(typeof spec.message(res) === "string" && spec.message(res).length > 0);
});

test("read: file 생략 = 저장소 전체 diff, staged 기본 false", async () => {
  const seen = [];
  const spec = await specOf("read", {
    execute: async (name, params) => {
      seen.push([name, params]);
      return { ok: true, code: "OK", message: "", data: { diff: "" } };
    },
  });
  const res = await spec.handler({});
  assert.equal(res.ok, true);
  assert.equal(res.diff, "");
  assert.equal(res.staged, false);
  assert.deepEqual(seen, [["plugin.soksak-plugin-git-core.diff", { staged: false }]]);
  // 빈 diff 도 message 는 답한다(변경 없음 안내)
  assert.ok(typeof spec.message(res) === "string" && spec.message(res).length > 0);
});

test("read: git-core diff 실패 봉투를 code 보존으로 전파 (침묵 실패 금지)", async () => {
  const spec = await specOf("read", {
    execute: async () => ({ ok: false, code: "INVALID_REF", message: "ref not allowed" }),
  });
  const res = await spec.handler({ commit: "zzz" });
  assert.equal(res.ok, false);
  assert.equal(res.code, "INVALID_REF");
});
