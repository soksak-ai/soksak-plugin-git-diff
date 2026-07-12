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

// 이 플러그인은 git 제공자를 **계약으로** 찾는다(soksak-git-spec@1) — 이름으로 찾지 않는다.
// 그래서 시험이 제공자의 id 를 정한다. 그리고 그 id 는 일부러 git-core 가 아니다: 코드 어딘가에
// 구현체 이름이 박혀 있으면 아래 시험은 통과할 수 없다.
const CONTRACT = "soksak-git-spec@1";
const PROVIDER = "soksak-plugin-any-git";
const ENABLED = [{ id: PROVIDER, version: "1.0.0", status: "enabled" }];

// 계약을 아는 mock 호스트 — plugin.implementers 에 답하고, 제공자 명령을 answers 로 흉내낸다.
// calls 에는 제공자 명령만 남는다(발견 호출은 별도 축 discovery 에).
function hostExec({ implementers = ENABLED, answers = {}, calls = [], discovery = [] } = {}) {
  return async (name, params) => {
    if (name === "plugin.implementers") {
      discovery.push(params);
      return { ok: true, code: "OK", message: "", data: { contract: params?.contract, implementers } };
    }
    calls.push([name, params]);
    const cmd = name.startsWith(`plugin.${PROVIDER}.`) ? name.slice(`plugin.${PROVIDER}.`.length) : null;
    const answer = cmd && answers[cmd];
    if (typeof answer === "function") return answer(params);
    if (answer) return answer;
    return cmd === "diff"
      ? { ok: true, code: "OK", message: "", data: { diff: "" } }
      : { ok: true, code: "OK", message: "", data: { entries: [] } };
  };
}

// activate() 를 mock 호스트로 구동 — 명령 등록을 포획하고 뷰 호스트는 스텁.
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
      execute: overrides.execute ?? hostExec(),
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

test("git 제공자를 계약으로 찾는다 — 구현체 이름은 코드에 없다", async () => {
  const calls = [];
  const discovery = [];
  const spec = await specOf("files", { execute: hostExec({ calls, discovery }) });
  await spec.handler({ path: "/repo" });
  assert.deepEqual(discovery, [{ contract: CONTRACT }], "plugin.implementers 를 계약 id 로 부르지 않음");
  assert.equal(calls[0][0], `plugin.${PROVIDER}.status`, "발견된 제공자가 아닌 곳으로 나갔다");
  for (const [name] of calls) {
    assert.ok(!name.includes("git-core"), `구현체 이름이 박혀 있다: ${name}`);
  }
});

test("구현체 0 → loud 거부 (조용한 빈 목록 금지)", async () => {
  for (const cmd of ["files", "read"]) {
    const spec = await specOf(cmd, { execute: hostExec({ implementers: [] }) });
    const res = await spec.handler({});
    assert.equal(res.ok, false, `${cmd}: 제공자 없이 성공했다`);
    assert.equal(res.code, "NO_GIT_PROVIDER");
    assert.ok(res.message.includes(CONTRACT), "message 가 어떤 계약이 없는지 말하지 않음");
  }
});

test("비활성 구현체는 제공자가 아니다 (enabled 만 부른다)", async () => {
  const spec = await specOf("files", {
    execute: hostExec({ implementers: [{ id: PROVIDER, version: "1.0.0", status: "disabled" }] }),
  });
  const res = await spec.handler({});
  assert.equal(res.ok, false);
  assert.equal(res.code, "NO_GIT_PROVIDER");
});

test("files: 변경 파일 목록을 ok 봉투로 반환 (뷰 목록과 동일 소스 — 계약 status)", async () => {
  // 계약 status 는 porcelain v2 형태 {path,x,y,status,...} 를 data.entries 로 준다 —
  // files 는 {path,status} 만 뽑고 untracked 디렉토리의 후행 슬래시를 제거한다.
  const statusEntries = [
    { path: "src/a.ts", x: ".", y: "M", status: "modified" },
    { path: "docs/", x: "?", y: "?", status: "untracked" },
  ];
  const calls = [];
  const spec = await specOf("files", {
    execute: hostExec({ calls, answers: { status: { ok: true, code: "OK", message: "", data: { entries: statusEntries } } } }),
  });
  const res = await spec.handler({ path: "/repo" });
  assert.equal(res.ok, true);
  assert.deepEqual(res.files, [
    { path: "src/a.ts", status: "modified" },
    { path: "docs", status: "untracked" },
  ]);
  assert.deepEqual(calls, [[`plugin.${PROVIDER}.status`, { path: "/repo" }]]);
  const m = spec.message(res);
  assert.ok(typeof m === "string" && m.length > 0, "message 가 문자열을 반환하지 않음");
});

test("files: path 생략 시 활성 프로젝트 루트 위임(파라미터 무전달)", async () => {
  const calls = [];
  const spec = await specOf("files", { execute: hostExec({ calls }) });
  const res = await spec.handler({});
  assert.equal(res.ok, true);
  assert.deepEqual(res.files, []);
  assert.equal(calls[0][0], `plugin.${PROVIDER}.status`);
  assert.deepEqual(calls[0][1], {}); // path 미지정은 그대로 위임 — 제공자가 활성 프로젝트로 해소
});

test("files: 소스 명령 실패 봉투를 code 보존으로 전파 (침묵 실패 금지)", async () => {
  const spec = await specOf("files", {
    execute: hostExec({ answers: { status: { ok: false, code: "NO_PATH", message: "no project root — pass path" } } }),
  });
  const res = await spec.handler({});
  assert.equal(res.ok, false);
  assert.equal(res.code, "NO_PATH");
  assert.ok(typeof res.message === "string" && res.message.length > 0);
});

test("read: unified diff 본문을 반환하고 file/staged 를 에코 (계약 diff 위임)", async () => {
  const calls = [];
  const spec = await specOf("read", {
    execute: hostExec({ calls, answers: { diff: { ok: true, code: "OK", message: "", data: { diff: "+added line" } } } }),
  });
  const res = await spec.handler({ path: "/repo", file: "src/a.ts", staged: true });
  assert.equal(res.ok, true);
  assert.equal(res.diff, "+added line");
  assert.equal(res.file, "src/a.ts");
  assert.equal(res.staged, true);
  assert.deepEqual(calls, [[`plugin.${PROVIDER}.diff`, { path: "/repo", file: "src/a.ts", staged: true }]]);
  assert.ok(typeof spec.message(res) === "string" && spec.message(res).length > 0);
});

test("read: file 생략 = 저장소 전체 diff, staged 기본 false", async () => {
  const calls = [];
  const spec = await specOf("read", { execute: hostExec({ calls }) });
  const res = await spec.handler({});
  assert.equal(res.ok, true);
  assert.equal(res.diff, "");
  assert.equal(res.staged, false);
  assert.deepEqual(calls, [[`plugin.${PROVIDER}.diff`, { staged: false }]]);
  // 빈 diff 도 message 는 답한다(변경 없음 안내)
  assert.ok(typeof spec.message(res) === "string" && spec.message(res).length > 0);
});

test("read: 제공자 diff 실패 봉투를 code 보존으로 전파 (침묵 실패 금지)", async () => {
  const spec = await specOf("read", {
    execute: hostExec({ answers: { diff: { ok: false, code: "INVALID_REF", message: "ref not allowed" } } }),
  });
  const res = await spec.handler({ commit: "zzz" });
  assert.equal(res.ok, false);
  assert.equal(res.code, "INVALID_REF");
});
