import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(readFileSync(join(__dirname, "../fixtures/dummy-ledger.json"), "utf-8"));

/**
 * FSA（File System Access API）をページロード前に無効化するヘルパー。
 * index.html は `const FSA_SUPPORTED = !!(window.showOpenFilePicker && ...)` で評価するため、
 * addInitScript で削除すると FSA_SUPPORTED=false になり、
 * fileHandle=null でも接続CTAが出ずに通常の一覧描画に進む。
 * これにより applyJson でダミーデータを注入したあとの描画テストが可能になる。
 */
async function disableFSA(page) {
  await page.addInitScript(() => {
    delete window.showOpenFilePicker;
    delete window.showSaveFilePicker;
  });
}

// (a) index.html がコンソールエラーなしでロードされる
test("コンソールエラーなしでロードされる", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.goto("/index.html");
  // DOMが安定するまで待つ
  await page.waitForLoadState("domcontentloaded");
  // xlsx.full.min.js のロードを含む networkidle を待つ
  await page.waitForLoadState("networkidle");

  expect(pageErrors, `ページエラー: ${pageErrors.join("\n")}`).toHaveLength(0);
});

// (b) applyJson でダミーデータを注入 → 一覧に行が描画される
test("applyJson でダミーデータを注入すると一覧に行が表示される", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await disableFSA(page);
  await page.goto("/index.html");
  await page.waitForLoadState("networkidle");

  // applyJson を呼んでデータを注入し、全件モードへ切り替え
  await page.evaluate((fixture) => {
    window.applyJson(fixture);
    window.setMode(true); // 全件表示
  }, FIXTURE);

  // .gi（行アイテム）が描画されていることを確認
  const items = page.locator("#list .gi");
  await expect(items).toHaveCount(FIXTURE.rows.length);

  expect(pageErrors).toHaveLength(0);
});

// (c) 「全件」「今日」モード切替が動く
test("今日やること / 全件 モード切替が動く", async ({ page }) => {
  await disableFSA(page);
  await page.goto("/index.html");
  await page.waitForLoadState("networkidle");

  await page.evaluate((fixture) => {
    window.applyJson(fixture);
    window.setMode(true);
  }, FIXTURE);

  // 「全件」ボタンが .on になっている
  await expect(page.locator("#segAll")).toHaveClass(/on/);
  await expect(page.locator("#segToday")).not.toHaveClass(/on/);

  // 「今日やること」ボタンをクリック
  await page.locator("#segToday").click();
  await expect(page.locator("#segToday")).toHaveClass(/on/);
  await expect(page.locator("#segAll")).not.toHaveClass(/on/);

  // countLbl が「今日やること：N件」形式になっている
  await expect(page.locator("#countLbl")).toContainText("今日やること");

  // 「全件」ボタンをクリックして戻す
  await page.locator("#segAll").click();
  await expect(page.locator("#countLbl")).toContainText("全件");
});

// (d) 検索ボックス入力で絞り込みが動く
test("検索ボックスで氏名絞り込みが動く", async ({ page }) => {
  await disableFSA(page);
  await page.goto("/index.html");
  await page.waitForLoadState("networkidle");

  await page.evaluate((fixture) => {
    window.applyJson(fixture);
    window.setMode(true);
  }, FIXTURE);

  // 全件表示されていることを確認
  await expect(page.locator("#list .gi")).toHaveCount(FIXTURE.rows.length);

  // 検索ボックスに架空太郎を入力
  await page.locator("#searchBox").fill("架空太郎");
  // 1件のみに絞り込まれる
  await expect(page.locator("#list .gi")).toHaveCount(1);
  await expect(page.locator("#list .gi .nm")).toContainText("架空太郎");

  // 検索クリアで全件に戻る
  await page.locator("#searchBox").fill("");
  await expect(page.locator("#list .gi")).toHaveCount(FIXTURE.rows.length);
});

// (e) 設定画面・SMS画面への遷移と一覧への復帰が動く
test("設定画面 / SMS画面 への遷移と一覧への復帰が動く", async ({ page }) => {
  await disableFSA(page);
  await page.goto("/index.html");
  await page.waitForLoadState("networkidle");

  await page.evaluate((fixture) => {
    window.applyJson(fixture);
  }, FIXTURE);

  // --- 設定画面へ遷移 ---
  await page.locator("#toSettings").click();
  // screenSettings が表示され、screenMain が非表示になる
  await expect(page.locator("#screenSettings")).not.toHaveClass(/hidden/);
  await expect(page.locator("#screenMain")).toHaveClass(/hidden/);
  // 「← 一覧へ戻る」ボタンが表示されている
  await expect(page.locator("#toMain")).not.toHaveClass(/hidden/);

  // 一覧へ戻る
  await page.locator("#toMain").click();
  await expect(page.locator("#screenMain")).not.toHaveClass(/hidden/);
  await expect(page.locator("#screenSettings")).toHaveClass(/hidden/);

  // --- SMS配信リスト画面へ遷移 ---
  await page.locator("#toSms").click();
  await expect(page.locator("#screenSms")).not.toHaveClass(/hidden/);
  await expect(page.locator("#screenMain")).toHaveClass(/hidden/);

  // 一覧へ戻る
  await page.locator("#toMain").click();
  await expect(page.locator("#screenMain")).not.toHaveClass(/hidden/);
  await expect(page.locator("#screenSms")).toHaveClass(/hidden/);
});

test("予約詳細にCRH予約メモ記載ルールが表示される", async ({ page }) => {
  await disableFSA(page);
  await page.goto("/index.html");
  await page.waitForLoadState("networkidle");

  await page.evaluate((fixture) => {
    window.applyJson(fixture);
    window.setMode(true);
  }, FIXTURE);

  await page.locator("#list .gi").first().click();

  const rules = page.getByRole("complementary", {
    name: "CRH予約メモ記載ルール",
  });
  await expect(rules).toBeVisible();
  await expect(rules.getByRole("listitem")).toHaveText([
    "お礼メール送付完了 ⇒ □",
    "電話コンタクト完了 ⇒ ■",
    "組数確定 ⇒ ◎",
    "M定例コンペ ⇒ 定例",
  ]);
  await expect(page.getByText("戻し方は2通り", { exact: false })).toHaveCount(0);

  await rules.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "test-results/crh-memo-rules.png",
    fullPage: true,
  });
});

test("状態変更をJSON操作履歴へ保存し予約詳細に表示する", async ({ page }) => {
  await disableFSA(page);
  await page.addInitScript(() => {
    localStorage.setItem("compe.updatedBy", "監査テスト");
  });
  await page.goto("/index.html");
  await page.waitForLoadState("networkidle");

  await page.evaluate((fixture) => {
    window.applyJson(fixture);
    window.setMode(true);
  }, FIXTURE);

  const target = page.locator("#list .gi").filter({ hasText: "架空太郎" });
  await expect(target).toHaveCount(1);
  await target.click();

  const confirmButton = page
    .locator("#detail")
    .getByRole("button", { name: "確定〇", exact: true });
  await expect(confirmButton).toHaveCount(1);
  await confirmButton.click();

  const saved = await page.evaluate(() => window.buildJson());
  const event = saved.auditLog.at(-1);
  expect(event).toMatchObject({
    by: "監査テスト",
    name: "架空太郎",
    play: "2026/08/10",
    action: "組数確定",
    before: "",
    after: "〇",
    source: "画面操作",
  });
  expect(event.at).toMatch(/\+09:00$/);
  expect(event.rowId).toBeTruthy();

  const history = page.getByRole("region", { name: "操作履歴" });
  await expect(history).toContainText("組数確定");
  await expect(history).toContainText("未 → 〇");
  await expect(history).toContainText("監査テスト");

  await page.getByRole("button", { name: "元に戻す", exact: true }).click();
  const afterUndo = await page.evaluate(() => window.buildJson());
  expect(afterUndo.auditLog.at(-1)).toMatchObject({
    action: "元に戻す（組数確定）",
    before: "〇",
    after: "",
    source: "元に戻す",
  });
  await expect(page.getByRole("region", { name: "操作履歴" })).toContainText(
    "元に戻す（組数確定）"
  );
});

test("CSV再取込の既存スキップと受付日時差を操作履歴へ保存する", async ({ page }) => {
  await disableFSA(page);
  await page.addInitScript(() => {
    localStorage.setItem("compe.updatedBy", "取込テスト");
  });
  await page.goto("/index.html");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "＋ CSV取込" }).click();

  await page.evaluate((fixture) => {
    window.applyJson(fixture);
    const header = [
      "ゴルフ場名",
      "データ種別",
      "プレー日",
      "コース",
      "スタート時間",
      "代表者名(漢字)",
      "代表者名(カナ)",
      "組数",
      "人数",
      "連絡先電話番号",
      "携帯電話番号",
      "FAX番号",
      "予約チャネル",
      "予約受付日時",
      "受付者",
      "受付者ロール",
    ];
    const row = [
      "泉佐野カントリークラブ",
      "一般予約",
      "2026/08/10",
      "松コース",
      "09:00",
      "架空太郎",
      "カクウタロウ",
      "5組",
      "20人",
      "'09000000001",
      "'09000000001",
      "'",
      "GORA",
      "2026/08/08 20:28:29",
      "WEB",
      "管理者",
    ];
    const conditionExcluded = [...row];
    conditionExcluded[2] = "2026/05/01";
    conditionExcluded[5] = "条件外三郎";
    conditionExcluded[6] = "ジョウケンガイサブロウ";
    const csv = [header, row, conditionExcluded]
      .map((values) => values.map((v) => `"${v}"`).join(","))
      .join("\n");
    document.getElementById("ta").value = csv;
    window.extract();
  }, FIXTURE);

  await expect(page.locator("#impMsg")).toContainText("うち新規 0 件");
  const saved = await page.evaluate(() => window.buildJson());
  const event = saved.auditLog.find((item) => item.action === "CSV既存スキップ");
  expect(event).toMatchObject({
    by: "取込テスト",
    name: "架空太郎",
    play: "2026/08/10",
    source: "CSV取込",
  });
  expect(event.before).toContain("受付:2026/06/10");
  expect(event.after).toContain("CSV受付:2026/08/08 20:28:29");
  expect(event.detail).toContain("受付日時");
  expect(saved.rows[0].recv).toBe("2026/06/10");
  const excluded = saved.auditLog.find((item) => item.action === "CSV条件除外");
  expect(excluded).toMatchObject({
    name: "条件外三郎",
    play: "2026/05/01",
    after: "除外：プレー日が過去",
  });
  expect(excluded.importId).toBe(event.importId);

  const importHistory = page.getByRole("region", { name: "CSV取込履歴" });
  await expect(importHistory).toContainText("新規0件・既存1件");
  await expect(importHistory).toContainText("取込テスト");
  await importHistory.getByText("判定明細 2件").click();
  await expect(importHistory).toContainText("架空太郎");
  await expect(importHistory).toContainText("CSV既存スキップ");
  await expect(importHistory).toContainText("条件外三郎");
  await expect(importHistory).toContainText("CSV条件除外");
});

test("CSVの新規候補と台帳登録を同じ予約の履歴へ保存する", async ({ page }) => {
  await disableFSA(page);
  await page.addInitScript(() => {
    localStorage.setItem("compe.updatedBy", "新規取込テスト");
  });
  await page.goto("/index.html");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "＋ CSV取込" }).click();

  await page.evaluate((fixture) => {
    window.applyJson(fixture);
    const header = [
      "ゴルフ場名",
      "データ種別",
      "プレー日",
      "コース",
      "スタート時間",
      "代表者名(漢字)",
      "代表者名(カナ)",
      "組数",
      "人数",
      "連絡先電話番号",
      "携帯電話番号",
      "FAX番号",
      "予約チャネル",
      "予約受付日時",
      "受付者",
      "受付者ロール",
    ];
    const row = [
      "泉佐野カントリークラブ",
      "一般予約",
      "2026/08/11",
      "竹コース",
      "10:00",
      "新規花子",
      "シンキハナコ",
      "4組",
      "16人",
      "'09000000002",
      "'09000000002",
      "'",
      "AGWeb",
      "2026/08/09 09:15:00",
      "WEB",
      "管理者",
    ];
    document.getElementById("ta").value = [header, row]
      .map((values) => values.map((v) => `"${v}"`).join(","))
      .join("\n");
    window.extract();
  }, FIXTURE);

  await expect(page.locator("#impMsg")).toContainText("うち新規 1 件");
  let saved = await page.evaluate(() => window.buildJson());
  const candidate = saved.auditLog.find(
    (item) => item.action === "CSV新規候補" && item.name === "新規花子"
  );
  expect(candidate).toMatchObject({
    play: "2026/08/11",
    before: "未登録",
    after: "登録待ち",
    by: "新規取込テスト",
  });
  const importHistory = page.getByRole("region", { name: "CSV取込履歴" });
  await importHistory.getByText("判定明細 1件").click();
  await expect(importHistory).toContainText("新規花子");
  await expect(importHistory).toContainText("CSV新規候補");

  await page.getByRole("button", { name: "台帳へ登録" }).click();
  saved = await page.evaluate(() => window.buildJson());
  const registered = saved.auditLog.find(
    (item) => item.action === "CSV新規登録" && item.name === "新規花子"
  );
  expect(registered.rowId).toBe(candidate.rowId);
  expect(saved.rows.some((row) => row.n === "新規花子")).toBe(true);
});
