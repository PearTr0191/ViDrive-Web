"""Shared constants for the resale data-pipeline scripts.

Every scraper previously hardcoded CURRENT_YEAR = 2026, which silently dropped
ALL rows once the calendar moved on (age filters exclude every listing). Derive
it from the clock so scheduled runs stay valid.
"""
from datetime import date

CURRENT_YEAR: int = date.today().year
