"""
PuryFi object labels and their PES detection categories.

Ids match the SDK's `Label` enum (0-26). Categories map to PES events;
`covered` marks labels where the body part is clothed.
"""

from __future__ import annotations

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
