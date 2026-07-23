from .initialize_logger import initialize_logger

from .discord import *
from .discord.cog_utils import get_cogs
from .calculate_magic_number import calculate_magic_number

__all__ = ["initialize_logger", "calculate_magic_number", "get_cogs"]
