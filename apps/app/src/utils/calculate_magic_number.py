import re
import random
import math


def calculate_magic_number(current_value: int, operators: str) -> int:
    """
    Calculate a magic number using operators

    @param
        current_value: int - current value (used for %)
        operators: str - operators like (+5, %+5)

    @return
        new_value: int - value calc or current value
    """

    # match [5-10]
    if match := re.match(r"^\[(\d+)-(\d+)\]$", operators):
        low, high = int(match.group(1)), int(match.group(2))
        return random.randint(min(low, high), max(low, high))

    # match +[5-10], -[5-10], %+[5-10], %-[5-10]
    if match := re.match(r"^(%*[+\-])\[(\d+)-(\d+)\]$", operators):
        op = match.group(1)

        low, high = int(match.group(2)), int(match.group(3))
        rand_val = random.randint(min(low, high), max(low, high))

        if op == "+":
            return min(current_value + rand_val, 99)
        elif op == "-":
            return max(current_value - rand_val, 0)
        elif op == "%+":
            return min(current_value + math.ceil(current_value * rand_val / 100), 99)
        elif op == "%-":
            return max(current_value - math.ceil(current_value * rand_val / 100), 0)

    # match +5, %+5, -5, %-5, 5
    if match := re.match(r"^(%[+\-]|[+\-]?)(\d+)$", operators):
        op = match.group(1)
        val = int(match.group(2))

        if op == "+":
            new_value = min(current_value + val, 99)
        elif op == "-":
            new_value = max(current_value - val, 0)
        elif op == "%+":
            new_value = min(current_value + math.ceil(current_value * val / 100), 99)
        elif op == "%-":
            new_value = max(current_value - math.ceil(current_value * val / 100), 0)
        else:
            new_value = val
        return new_value

    # fallback return unchanged value
    return current_value
