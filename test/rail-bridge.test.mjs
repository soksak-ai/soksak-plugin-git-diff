// 레일 브리지 정합 — 사이드바 투영(§3.1)의 DOM 재부모화 채널 헤드리스 게이트.
// node --test 만으로 실행된다(DOM 불요 — appendChild 만 쓰는 가짜 컨테이너로 검증).
// 검사 축: ① 컨테이너 등록 시 요소가 adopt 후 컨테이너로 이동 ② 해제 시 restore 로
// 인라인 복귀 ③ 결속 해제(unbind)도 인라인 복귀 ④ viewId 없음(구 코어·사이드바 배치)
// = no-op(인라인 유지) ⑤ 재등록(새 컨테이너) 시 새 컨테이너로 재이동.
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerRailContainer, bindRailSlot } from "../main.js";

// appendChild 만 흉내내는 가짜 컨테이너 — DOM 이동의 관찰 지점.
const fakeContainer = () => ({
  children: [],
  appendChild(el) {
    this.children.push(el);
  },
});

function harness(viewId) {
  const el = { name: "list" };
  const log = [];
  const unbind = bindRailSlot(viewId, "files", el, {
    adopt: () => log.push("adopt"),
    restore: () => log.push("restore"),
  });
  return { el, log, unbind };
}

test("컨테이너 등록 → adopt 후 컨테이너로 이동, 해제 → restore 복귀", () => {
  const { el, log, unbind } = harness("v1");
  assert.deepEqual(log, []); // 등록 전 = 인라인 유지(폴백)
  const c = fakeContainer();
  const off = registerRailContainer("v1", "files", c);
  assert.deepEqual(log, ["adopt"]);
  assert.deepEqual(c.children, [el]);
  off();
  assert.deepEqual(log, ["adopt", "restore"]);
  unbind();
  assert.deepEqual(log, ["adopt", "restore"]); // 이미 인라인 — 중복 restore 없음
});

test("결속 해제(unbind) 시 인라인 복귀", () => {
  const { log, unbind } = harness("v2");
  const off = registerRailContainer("v2", "files", fakeContainer());
  assert.deepEqual(log, ["adopt"]);
  unbind();
  assert.deepEqual(log, ["adopt", "restore"]);
  off(); // 이후 해제는 no-op(결속이 이미 끊김)
  assert.deepEqual(log, ["adopt", "restore"]);
});

test("viewId 없음(구 코어·사이드바 배치) = no-op — 인라인 유지", () => {
  const { log, unbind } = harness(null);
  registerRailContainer("v3", "files", fakeContainer());
  assert.deepEqual(log, []);
  unbind();
  assert.deepEqual(log, []);
});

test("다른 viewId 의 등록에는 반응하지 않는다 (per-view 1:1)", () => {
  const { log } = harness("v4");
  const off = registerRailContainer("v5", "files", fakeContainer());
  assert.deepEqual(log, []);
  off();
});

test("재마운트(새 컨테이너) → 새 컨테이너로 재이동", () => {
  const { el, log } = harness("v6");
  const a = fakeContainer();
  const offA = registerRailContainer("v6", "files", a);
  const b = fakeContainer();
  registerRailContainer("v6", "files", b); // 같은 슬롯 재등록 — 새 컨테이너가 이긴다
  assert.deepEqual(log, ["adopt", "adopt"]);
  assert.deepEqual(b.children, [el]);
  offA(); // 낡은 등록의 해제는 현재 컨테이너를 건드리지 않는다
  assert.deepEqual(log, ["adopt", "adopt"]);
});
