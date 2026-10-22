"""
PuryFi object labels and their PES detection categories.

Ids match the SDK's `Label` enum (0-26). Categories map to PES events;
`covered` marks labels where the body part is clothed.
"""

from __future__ import annotations

import re

# label id -> display name
PURYFI_LABELS: dict[int, str] = {
    0: "Tummy",
    1: "TummyCovered",
    2: "Buttocks",
    3: "ButtocksCovered",
    4: "FemaleBreast",
    5: "FemaleBreastCovered",
    6: "FemaleGenitals",
    7: "FemaleGenitalsCovered",
    8: "MaleGenitalsCovered",
    9: "MaleGenitals",
    10: "MaleBreast",
    11: "MaleBreastCovered",
    12: "FaceFemale",
    13: "FaceMale",
    14: "FootCovered",
    15: "Foot",
    16: "ArmpitCovered",
    17: "Armpit",
    18: "AnusCovered",
    19: "Anus",
    20: "Eye",
    21: "Mouth",
    22: "NippleCovered",
    23: "Nipple",
    24: "HandCovered",
    25: "Hand",
    26: "Silhouette",
}

# label id -> body-part icon in the frontend PuryFi asset folder
LABEL_ICONS: dict[int, str] = {
    0: "belly.png",
    1: "belly_covered.png",
    2: "buttocks_exposed.png",
    3: "buttocks_covered.png",
    4: "breasts_female_exposed.png",
    5: "breasts_female_covered.png",
    6: "genitals_female_exposed.png",
    7: "genitals_female_covered.png",
    8: "genitals_male_covered.png",
    9: "genitals_male_exposed.png",
    10: "breasts_male.png",
    11: "breasts_male_covered.png",
    12: "face_female.png",
    13: "face_male.png",
    14: "feet_covered.png",
    15: "feet_exposed.png",
    16: "armpit_covered.png",
    17: "armpit_exposed.png",
    18: "anus_covered.png",
    19: "anus_exposed.png",
    20: "eye.png",
    21: "mouth.png",
    22: "nipple_covered.png",
    23: "nipple_exposed.png",
    24: "hand_covered.png",
    25: "hand_exposed.png",
    26: "silhouette.png",
}

# category key -> representative aggregate icon
CATEGORY_ICONS: dict[str, str] = {
    "genitals": "genitals_female_exposed.png",
    "breasts": "breasts_female_exposed.png",
    "buttocks": "buttocks_exposed.png",
    "anus": "anus_exposed.png",
    "nipples": "nipple_exposed.png",
    "body": "silhouette.png",
    "face": "face_female.png",
}

# category key -> (event id, {label id: covered})
CATEGORIES: dict[str, dict] = {
    "genitals": {
        "event": "puryfi_genitals_detected",
        "labels": {6: False, 7: True, 8: True, 9: False},
    },
    "breasts": {
        "event": "puryfi_breasts_detected",
        "labels": {4: False, 5: True, 10: False, 11: True},
    },
    "buttocks": {
        "event": "puryfi_buttocks_detected",
        "labels": {2: False, 3: True},
    },
    "anus": {
        "event": "puryfi_anus_detected",
        "labels": {18: True, 19: False},
    },
    "nipples": {
        "event": "puryfi_nipples_detected",
        "labels": {22: True, 23: False},
    },
    "body": {
        "event": "puryfi_body_detected",
        "labels": {
            0: False,
            1: True,
            14: True,
            15: False,
            16: True,
            17: False,
            24: True,
            25: False,
            26: False,
        },
    },
    "face": {
        "event": "puryfi_face_detected",
        "labels": {12: False, 13: False, 20: False, 21: False},
    },
}

# label id -> (category key, covered)
LABEL_TO_CATEGORY: dict[int, tuple[str, bool]] = {
    label: (category, covered)
    for category, definition in CATEGORIES.items()
    for label, covered in definition["labels"].items()
}


def label_name(label_id: int) -> str:
    return PURYFI_LABELS.get(label_id, f"Unknown({label_id})")


def display_label(label_id: int) -> str:
    """Human label, e.g. FemaleBreastCovered -> "Female breast (covered)"."""
    name = label_name(label_id)
    covered = name.endswith("Covered")
    if covered:
        name = name[: -len("Covered")]

    words = re.sub(r"(?<!^)(?=[A-Z])", " ", name).lower()
    if words.startswith("face "):
        words = f"{words[5:]} face"

    text = words[:1].upper() + words[1:]
    return f"{text} (covered)" if covered else text


def label_event_id(label_id: int) -> str:
    """Stable event id for one PuryFi label, e.g. puryfi_detected_female_breast."""
    snake = re.sub(r"(?<!^)(?=[A-Z])", "_", label_name(label_id)).lower()
    return f"puryfi_detected_{snake}"


LABEL_EVENT_IDS: dict[int, str] = {
    label_id: label_event_id(label_id) for label_id in PURYFI_LABELS
}
