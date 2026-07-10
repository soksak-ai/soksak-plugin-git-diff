// 뷰 status 축 정합 — C2 투명성(뷰가 자기 상태를 보고한다)의 헤드리스 게이트.
// node --test 만으로 실행된다(앱·소켓·DOM 불요). 검사 축 2개:
//   ① deriveViewStatus 순수 사상 — 로딩·clean·changed·error 를 뷰 status{code,message} 로.
//      message 는 locale 해소(사람표면 {en,ko}). 이 뷰는 읽기 전용 뷰어라 blocking 상태가 없다.
//   ② main.js 배선 정합 — 뷰가 실제로 vctx.setStatus 로 네 전이를 보고한다(소스 스캔, doctor 식).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { deriveViewStatus } from "../main.js";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(here, "..", "main.js"), "utf8");

// msg 대역 — en=첫 인자, ko=둘째 인자(main.js 의 msg 헬퍼와 동형).
const en = (a, _b) => a;
const ko = (_a, b) => b;

// 코어 STATUS_BLOCKING(closeGuard.ts) — 이 code 만 닫기 가드를 발동한다. 그 외는 표시 전용.
const BLOCKING = new Set(["dirty", "busy", "running"]);

test("loading → 표시 전용 loading code, locale 해소 message", () => {
  assert.deepEqual(deriveViewStatus({ kind: "loading" }, en), {
    code: "loading",
    message: "Loading…",
  });
  assert.equal(deriveViewStatus({ kind: "loading" }, ko).message, "불러오는 중…");
});

test("clean → 변경 없음(locale 해소)", () => {
  assert.deepEqual(deriveViewStatus({ kind: "clean" }, en), {
    code: "clean",
    message: "No changes",
  });
  assert.deepEqual(deriveViewStatus({ kind: "clean" }, ko), {
    code: "clean",
    message: "변경 없음",
  });
});

test("changed → count 를 message 에 싣는다(locale 해소)", () => {
  const s = deriveViewStatus({ kind: "changed", count: 3 }, en);
  assert.equal(s.code, "changed");
  assert.match(s.message, /3/);
  assert.equal(deriveViewStatus({ kind: "changed", count: 3 }, ko).message, "변경 3개");
});

test("error → 조회 실패 message 통과", () => {
  const s = deriveViewStatus({ kind: "error", message: "boom" }, en);
  assert.deepEqual(s, { code: "error", message: "boom" });
});

test("읽기 전용 뷰어라 blocking 상태가 없다 — 전 code 는 표시 전용", () => {
  const outcomes = [
    { kind: "loading" },
    { kind: "clean" },
    { kind: "changed", count: 1 },
    { kind: "error", message: "x" },
  ];
  for (const o of outcomes) {
    assert.ok(
      !BLOCKING.has(deriveViewStatus(o, en).code),
      `${o.kind} 이 blocking code 로 새어나감(억지 닫기 가드)`,
    );
  }
});

test("미지 outcome 은 status 없음(null) — 억지 상태 금지", () => {
  assert.equal(deriveViewStatus({ kind: "nope" }, en), null);
});

// 배선 정합 — 뷰가 실제로 vctx.setStatus 로 상태를 보고하고 네 전이가 모두 보고 경로에 있다.
test("view 는 vctx.setStatus 로 네 상태 전이를 보고한다(배선 정합)", () => {
  assert.match(SRC, /vctx\.setStatus/, "vctx.setStatus 호출 없음 — 상태 미보고");
  assert.match(SRC, /deriveViewStatus/, "deriveViewStatus 미배선 — 사상 seam 미사용");
  for (const kind of ["loading", "clean", "changed", "error"]) {
    assert.match(
      SRC,
      new RegExp(`kind:\\s*"${kind}"`),
      `${kind} 전이가 보고 경로에 없음`,
    );
  }
});
