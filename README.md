# ˚.✨⋆ PlunEStim 

PlunEStim (PES) is a Software that allow you to run EStim sessions with someone online or alone, using 2B DIY Boards (up to 6 channels), BT Sensors (2 Motion, 1 Noise), it also support Chaster integration to add events from random people or your partner, and control **your** Chaster lock in several ways and using it against you.

## ˚.✨⋆ Project goals

From a given project (thanks to the original author), create the first brick of Plune Project.
A Software that can arouse, calm or train you into being nice c:
EStim is a fun thing, even more fun when you're not the one having controls, being just here, you don't know if you'll have pleasure or pain...
Randomness and Surprise is a real funny thing, having random actions done over you or your devices, giving up controls to random people or a special one.

## ˚.✨⋆ How its work

You can control units (mode, level, waveforms, etc...), sensors (alarms, sensitivities...), chaster lock, over Internet, manually, by defining **Trigger Rules** launching **Actions** based on **Events** received from 3rd party integrations (like Chaster, Discord or from a Viewer) or from **Sensors** (motion, sound), you can also create and apply preset **Profiles**.

### ˚.✨⋆ Events

Events are things that happens, can be triggered by 3rd party integrations (like Chaster, Discord or from a Viewer) or from the **Sensors** (motion, position,sound).
Available Events:
- Chaster : Pillory (vote, start, end), Time Events, Tasks, Wheel of Fortune, Freeze/Unfreeze, SharedLink votes
- Sensors : Motion, Position, Sound

### ˚.✨⋆ Trigger Rules

Trigger Rules are rules issued by **Events**, these contains consequences called **Actions**, a Rule can trigger 1 or more Actions, an event can have 1 or more Rules.

Example : Subject get a Pillory Vote, Administrator can create a Rule for this event that will trigger the Action "increase +10% on a random unit"

### ˚.✨⋆ Actions

Actions are the consequences of a Trigger Rule, available types of Actions are :
- Update Multiplier on 1 or 2 units/channels
- Update intensity on 1 or more units/channels supporting `+`, `-`, `+X%`, `-X%`, `[X-Y]`, `[X-Y%]` operators 
- Apply a preset profile 
- Add or Remove Time to a Chaster Lock

### ˚.✨⋆ MagicNumbers and Random Values

MagicNumbers are used to perform calculations on values, they are used in **Actions** (and maybe more in the future).
They can be used with random values ( RO and RM, see Units Randomness and Channels Randomness below).

#### ˚.✨⋆ MagicNumbers

##### ✨ Numbers

- `5` : set value to 5
- `+5` : add 5 to current value
- `-5` : remove 5 from current value
- `[5-10]` : set value to a random value between 5 and 10
- `+[5-10]` : add a random value between 5 and 10 to current value
- `-[5-10]` : remove a random value between 5 and 10 from current value

##### ✨ Percentage Numbers

- `%+5` : add 5% to current value
- `%-5` : remove 5% from current value
- `%+[5-10]` : add a random value between 5% and 10% to current value
- `%-[5-10]` : remove a random value between 5% and 10% from current value

#### ˚.✨⋆ Random Values
Random Values are used in **Actions** (and maybe more in the future).

##### ✨ Units Randomness

`[Numbers]|[Numbers]RO|[Numbers]RM`
```
RO : If the input is 123RO, it randomly picks exactly one unit from the provided numbers.
RM : If the input is 123RM, it iterates through each number and has a 50% chance to include it. If none are selected, it picks one at random as a fallback.
Static List : If the input is just numbers (e.g., 12), it uses them as a list (['1', '2']).
```

##### ✨ Channels Randomness
`AB|ABRO|ABRM`
```
ABO : Randomly picks either Channel A or Channel B.
ABRM : Randomly picks one, both, or none (with a fallback to at least one).
AB : Returns both channel
```
