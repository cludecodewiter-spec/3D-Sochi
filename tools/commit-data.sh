#!/usr/bin/env bash
# 取り込み結果を data/ にコミットして push する。
#
# テキスト経路とスキャン経路の 2 つのワークフローが同じブランチに書き込むため、
# 衝突するのは「派生ファイル」（index.json / dedup.json / import-report.md）だけになる。
# 問題そのもの（回ごとの JSON）はファイル名が重ならない。
# そこで衝突時は、相手の取り込み結果を取り込んだうえで派生ファイルを作り直す。
set -uo pipefail

MSG="${1:?commit message required}"
BRANCH="${GITHUB_REF_NAME:?}"
DERIVED=(data/questions/index.json data/questions/dedup.json data/import-report.md)

git config user.name  "jpfetest-importer"
git config user.email "noreply@github.com"

git add -A data
if git diff --cached --quiet; then
  echo "no data changes"
  exit 0
fi
git commit -m "$MSG [skip ci]"

regenerate() {
  # 派生ファイルは、いま手元にある回の JSON 全部から作り直す
  node tools/dedup.mjs || return 1
  node tools/validate.mjs || return 1
  node tools/report.mjs > /dev/null || return 1
}

for attempt in 1 2 3; do
  git fetch origin "$BRANCH"

  if ! git rebase "origin/$BRANCH"; then
    echo "派生ファイルが衝突したので、自分の生成結果を採用して作り直す"
    # rebase 中の --theirs は「適用しようとしている自分のコミット」側
    for f in "${DERIVED[@]}"; do
      git checkout --theirs "$f" 2>/dev/null || true
    done
    git add -A data
    if ! git -c core.editor=true rebase --continue; then
      git rebase --abort
      echo "rebase を解決できなかった"
      exit 1
    fi
    if regenerate; then
      git add -A data
      git commit --amend --no-edit
    else
      echo "派生ファイルの再生成に失敗した"
      exit 1
    fi
  fi

  if git push origin "HEAD:$BRANCH"; then
    echo "pushed"
    exit 0
  fi
  sleep $((attempt * 5))
done

echo "push failed after retries"
exit 1
