"""Пороги и коды критериев для подсказок в админке."""

MAX_DATALIST_OPTIONS = 120

# Числовые критерии: в datalist только целые шаги (м, годы гарантии и т.д.)
INTEGER_DATALIST_CRITERION_CODES = frozenset({
    "max_pipe_length",
    "max_height_diff",
    "warranty",
})
