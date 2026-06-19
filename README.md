# ToDoリストアプリ

シンプルなブラウザ版ToDoリストです。

## 使い方

1. `index.html` を開きます。
2. タスクを入力して「追加」をクリックするか、Enterキーを押します。
3. タスクを完了または削除できます。

## ローカルアクセスURL

- `file:///c:/Users/smahi/neko/index.html`

> 注: 現在この環境ではPythonやNode.jsなどのローカルサーバー実行環境が使えないため、ファイルを直接ブラウザで開いてください。

## GitHub への公開について

この環境では `git` がインストールされておらず、また `gh` CLI も利用できません。そのため、ここから自動的にGitHubへアップロードしたり、GitHub Pagesを発行したりすることはできません。

### 手動で公開するには

1. GitHub上で新しいリポジトリを作成する。
2. ローカルに `git` をインストールしてリポジトリを初期化する。
3. ファイルを追加してコミットし、GitHubのリモートにプッシュする。
4. GitHubリポジトリの「Settings > Pages」で `main` または `master` を公開ブランチに設定する。

## 参考コマンド

```bash
git init
git add .
git commit -m "Add ToDo list app"
git branch -M main
git remote add origin https://github.com/<あなたのユーザー名>/<リポジトリ名>.git
git push -u origin main
```

GitHub Pages の公開後、URL が表示されます。