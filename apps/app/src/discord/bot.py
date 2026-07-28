"""
Discord bot (nextcord): bot lifecycle only. Slash commands live in cogs under
`commands/` (loaded via `utils.get_cogs`); sensor alarm dispatch runs as an
asyncio task in the FastAPI lifespan (`api.app.sensor_alarm_loop`).
"""

import json

import nextcord
import structlog
from nextcord.ext.commands import Bot as NextcordBot

from constants import DISCORD_GUILD_IDS
from utils.users.generate_root_access import generate_root_access

logger = structlog.get_logger("pes")

# API change
intents = nextcord.Intents.default()
intents.message_content = True
intents.members = True

with open("configurations/configuration.json") as json_file:
    CONFIGURATION = json.load(json_file)


class Bot2b3(NextcordBot):
    def __init__(
        self,
    ):
        super().__init__(
            command_prefix="/",
            description="ESTIM Remote management",
            help_command=None,
            intents=intents,
            rollout_all_guilds=True,
            default_guild_ids=DISCORD_GUILD_IDS,
        )

        self.initialized: bool = False

        # Initialize Environment Vars
        self.subjectId: int = CONFIGURATION["subjectDiscordId"]
        self.administrators: list[int] = [
            self.subjectId,
            CONFIGURATION["trustedDiscordId"],
        ]

        # @TextChannel
        self.cmdsChannel: nextcord.abc.GuildChannel | None = None
        self.logChannel: nextcord.abc.GuildChannel | None = None
        self.statusChannel: nextcord.abc.GuildChannel | None = None

        logger.info("Discord bot initalized")

        self.previous_2B_sync = False  # previous global 2B sync

    # @Bot is Ready
    async def on_ready(self):
        # Find and save usefull channels
        self.logChannel = self.get_channel(CONFIGURATION["logsChannelId"])  # type: ignore
        self.statusChannel = self.get_channel(CONFIGURATION["statusChannelId"])  # type: ignore

        # create root and redirect host to it
        magicLink: str = generate_root_access()
        await self.get_user(CONFIGURATION["subjectDiscordId"]).send(
            content=f"{magicLink}"
        )
        return True

    # cmd arg errors
    async def on_command_error(self, context, exception):
        logger.error(str(exception))
