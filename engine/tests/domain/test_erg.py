"""Domain tests for engine.domain.erg."""
from engine.domain.erg import compute_cadence_table, compute_target_power_table


def test_power_table_flat():
    grades = (0.0, 1.0, 2.5)
    table = compute_target_power_table(grades, ftp_w=200.0)
    # 0.0–3.0% → 0.85 FTP
    assert all(abs(p - 0.85 * 200.0) < 0.001 for p in table)


def test_power_table_steep_climb():
    grades = (9.5,)
    table = compute_target_power_table(grades, ftp_w=200.0)
    assert abs(table[0] - 1.20 * 200.0) < 0.001


def test_power_table_descent():
    grades = (-5.0,)
    table = compute_target_power_table(grades, ftp_w=200.0)
    assert abs(table[0] - 0.50 * 200.0) < 0.001


def test_cadence_table_flat():
    grades = (1.0, 2.0)
    table = compute_cadence_table(grades)
    assert all(rpm == 85 for rpm in table)


def test_cadence_table_descent():
    grades = (-1.0,)
    table = compute_cadence_table(grades)
    assert table[0] == 90


def test_cadence_table_steep():
    grades = (9.5,)
    table = compute_cadence_table(grades)
    assert table[0] == 70


def test_parallel_lengths():
    grades = (0.0, 3.5, 7.0, -1.0, 10.0)
    p = compute_target_power_table(grades, ftp_w=250.0)
    c = compute_cadence_table(grades)
    assert len(p) == len(grades)
    assert len(c) == len(grades)
