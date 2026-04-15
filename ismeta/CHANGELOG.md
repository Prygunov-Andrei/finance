# Changelog

Все заметные изменения ISMeta. Формат — [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/), версии — [Semver](https://semver.org/).

## [Unreleased]

### Added
- Архитектурная спецификация (14 документов в `specs/`).
- Комплекс документации онбординга: README, ONBOARDING, GLOSSARY, DOMAIN-GUIDE, CONTRIBUTING.
- ADR для 14 ключевых архитектурных решений (`docs/adr/`).
- Скелеты проекта (backend, frontend, Makefile, tools/mocks).
- Sample-данные для разработки (`docs/samples/`): recognition response, snapshot, webhook payloads, agent transcript, ER-диаграмма.
- Документы команды: TEAM.md, EPICS.md.

### Changed
- — (пока нет релизов)

### Deprecated
- —

### Removed
- —

### Fixed
- —

### Security
- —

## Версии

Пока нет выпущенных версий. Первый релиз (`0.1.0-alpha`) планируется после закрытия эпиков E1-E5 согласно [`specs/08-stage1-dependencies.md`](./specs/08-stage1-dependencies.md).

## Как обновлять

При каждом merge в `main`, содержащем пользовательские изменения, автор PR добавляет строку в соответствующую секцию `[Unreleased]`. При релизе `[Unreleased]` переезжает под номер версии с датой.
