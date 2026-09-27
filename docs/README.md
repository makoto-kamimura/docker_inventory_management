# docs

仕様書の本体はリポジトリ直下の [README.md](../README.md)。`docs/` には、それ以外の資料を種類ごとのフォルダに分けて置く。

| フォルダ | 置くもの | 書く人 |
|---|---|---|
| [design/](design/) | 設計・計画の資料（README に載せきれない検討・実装計画など） | 人 |
| [runbooks/](runbooks/) | 運用手順書（[起動・運用・本番デプロイ](runbooks/operation.md)・[Alexa スキルのセットアップ](runbooks/alexa-setup.md)） | 人 |
| [incidents/](incidents/) | 障害のふりかえり（`YYYY-MM-DD-<概要>.md`） | 人 |
| [tasks/](tasks/) | 不具合・要望のタスク（`task.md` はローカル管理で git 管理外） | 人 |
| [screenshots/](screenshots/) | README 用のスクリーンショット | 人 |
| [archive/](archive/) | 旧 React Native 実装の参考保管。新規開発の参照元にしない | — |

- まだ中身のないフォルダには、フォルダを git に残すための `.gitkeep` を置いている。中身ができても消さなくてよい。
- 秘匿情報（`*.local.md`）と Expo Go の QR（`qr.md` / `qr.png`）は `docs/` 直下に置くが、git 管理外（`.gitignore`）。
- 不具合・要望のタスクは `tasks/` にだけ置く。設計・運用の資料と混ぜない。
