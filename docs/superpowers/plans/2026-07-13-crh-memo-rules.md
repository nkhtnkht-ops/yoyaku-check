# CRH Memo Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 予約詳細のメモ欄直下にCRH予約メモ記載ルール4項目を表示し、既存の「戻し方は2通り…」案内を削除する。

**Architecture:** 既存の単一ファイルSPA構成を維持し、`index.html` の詳細テンプレート内だけを差し替える。表示専用の`aside`と小さなCSSクラスを追加し、データ保存・入力ロジックには触れない。

**Tech Stack:** HTML/CSS、既存のインラインJavaScriptテンプレート、Playwright E2E

## Global Constraints

- 見出しは「※CRH予約メモ記載ルール」とする。
- 表示内容は「お礼メール送付完了 ⇒ □」「電話コンタクト完了 ⇒ ■」「組数確定 ⇒ ◎」「M定例コンペ ⇒ 定例」の4項目とする。
- 既存の「戻し方は2通り…」案内文は完全に削除する。
- メモの入力・保存処理、予約データ、その他の画面は変更しない。
- 実データをテストやリポジトリへ追加しない。

---

## File Map

- Modify: `tests/e2e/smoke.spec.js` — CRHルール表示と旧案内削除を検証するE2Eテストを追加する。
- Modify: `index.html:88` — CRHルール案内用の控えめな表示スタイルを追加する。
- Modify: `index.html:1156` — 旧案内文をCRHルールの`aside`へ差し替える。

### Task 1: CRH予約メモ記載ルールの表示

**Files:**
- Modify: `tests/e2e/smoke.spec.js`
- Modify: `index.html:88`
- Modify: `index.html:1156`

**Interfaces:**
- Consumes: `window.applyJson(fixture)`、`window.setMode(true)`、既存の`#list .gi`クリックによる詳細表示。
- Produces: `aside.memo-rule-note[aria-label="CRH予約メモ記載ルール"]` と、その中の番号付き4項目。

- [ ] **Step 1: 失敗するE2Eテストを追加する**

`tests/e2e/smoke.spec.js` の末尾へ次を追加する。

```js
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

  await page.screenshot({
    path: "test-results/crh-memo-rules.png",
    fullPage: true,
  });
});
```

- [ ] **Step 2: テストが期待どおり失敗することを確認する**

localhost限定のテストサーバーを別プロセスで起動する。

```powershell
Start-Process -FilePath python -ArgumentList '-m','http.server','8123','--bind','127.0.0.1' -WorkingDirectory 'C:\tmp\yoyaku-check-crh-memo-rules' -WindowStyle Hidden -PassThru
```

対象テストだけを実行する。

```powershell
npx playwright test tests/e2e/smoke.spec.js --grep "CRH予約メモ記載ルール"
```

Expected: FAIL。`getByRole('complementary', { name: 'CRH予約メモ記載ルール' })` が見つからない。

- [ ] **Step 3: 最小の表示実装を追加する**

`index.html` の`.sec`付近へ次のCSSを追加する。

```css
.memo-rule-note{margin-top:14px;padding:12px 14px;border:1px solid var(--line);border-radius:6px;background:#fafafa;color:#555;font-size:12px;line-height:1.7;}
.memo-rule-title{font-weight:600;color:#333;margin-bottom:4px;}
.memo-rule-note ol{margin:0;padding-left:1.8em;}
.memo-rule-note li{padding-left:2px;}
```

`index.html` の旧案内`<p>`を次へ差し替える。

```html
<aside class="memo-rule-note" aria-label="CRH予約メモ記載ルール">
  <div class="memo-rule-title">※CRH予約メモ記載ルール</div>
  <ol>
    <li>お礼メール送付完了 ⇒ □</li>
    <li>電話コンタクト完了 ⇒ ■</li>
    <li>組数確定 ⇒ ◎</li>
    <li>M定例コンペ ⇒ 定例</li>
  </ol>
</aside>
```

- [ ] **Step 4: 対象テストが成功することを確認する**

```powershell
npx playwright test tests/e2e/smoke.spec.js --grep "CRH予約メモ記載ルール"
```

Expected: `1 passed`。`test-results/crh-memo-rules.png` が生成される。

- [ ] **Step 5: 全テストと静的検査を実行する**

```powershell
npm run lint
npm test
npm run test:e2e
git diff --check
```

Expected: lint成功、Vitest終了コード0、Playwright全20テスト成功、`git diff --check`出力なし。

- [ ] **Step 6: 差分と秘密情報を確認する**

```powershell
git diff -- index.html tests/e2e/smoke.spec.js
git status --short
```

Expected: `index.html`のCSS・案内差し替えと、`tests/e2e/smoke.spec.js`の1テスト追加だけ。APIキー、トークン、実予約データを含まない。

- [ ] **Step 7: 実装をコミットする**

```powershell
git add index.html tests/e2e/smoke.spec.js
git commit -m "feat: show CRH memo rules"
```

Expected: 実装2ファイルだけを含む新規コミットが作成される。

