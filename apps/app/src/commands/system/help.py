import time

import nextcord
from nextcord import Interaction, slash_command, SlashOption
from nextcord.ext.commands import Cog

from typings.enums import TriggerableEvent
from api.ws.websocket_notifier import ws_notifier

from pprint import pprint


class HelpCommand(Cog):
    def __init__(self, bot):
        self.bot = bot

    @slash_command(description="Show Help")
    async def help(self, interaction: Interaction):
        # pprint(list(TriggerableEvent))

        ws_notifier.notify("notification", {"help": "OK"})

        await interaction.send(f"Pong! {self.bot.latency * 1000:.2f}ms")


def setup(bot):
    bot.add_cog(HelpCommand(bot))
