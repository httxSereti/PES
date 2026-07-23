import os
import pathlib

import structlog

from constants import DIR_USERDATA

logger = structlog.get_logger("pes")


class ProfileModule:
    def __init__(self) -> None:
        # Initialize
        self.initialized: bool = False
        self.profilePath: pathlib.Path = pathlib.Path(DIR_USERDATA + "/profiles")
        self.profileFiles: list[str] = []

    def loadProfiles(self) -> None:
        """Load all Profiles inside userdata"""
        logger.info("[Profile] Loading Profiles...")

        profileFiles: list[str] = []

        try:
            profileFiles = os.listdir(self.profilePath)
        except FileNotFoundError:
            os.makedirs(self.profilePath)
            logger.info("[Profile] Created Profile directory!")

        logger.info(f"[Profile] Loaded {len(self.profileFiles)} profiles!")
        self.profileFiles = profileFiles
        self.initialized = True
