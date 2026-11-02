"""
Smart Home Digital Twin – Blender export helper
================================================
Run inside Blender (Scripting workspace → open this file → Run Script) with
AI_Smart_Home_Realism.blend loaded.

1. Tags every object with custom properties the website reads from glTF extras:
     roomId        – Rooms.RoomsID        (1 livingRoom, 2 diningRoom, 3 bedRoom, 4 bathRoom)
     applianceId   – Appliance.ApplianceID (aircon01, fan02, light04, …)
     applianceType – Appliance.ApplianceType
   Tagging is based on the object-name prefixes used in the model (edit the
   tables below if you rename things). Nothing else in the scene is modified.
2. Exports models/smart_home.glb next to the website (set OUTPUT below).

The website also falls back to name-matching (js/mapping.js), so the export
works even if you skip the tagging – but tagging makes the link explicit.
"""
import re
import bpy
from pathlib import Path

# Where to write the .glb (default: ../models/smart_home.glb relative to this script,
# or next to the .blend file if the script is run from the text editor).
OUTPUT = Path(bpy.path.abspath("//")) / "smart_home.glb"

APPLIANCES = {  # object-name prefix regex → (ApplianceID, ApplianceType)
    r"^AC_Living(_|$)":      ("aircon01", "Aircon"),
    r"^AC_Bedroom(_|$)":     ("aircon02", "Aircon"),
    r"^Fan_Living(_|$)":     ("fan01", "Fan"),
    r"^Fan_Dining(_|$)":     ("fan02", "Fan"),
    r"^Fan_Bedroom(_|$)":    ("fan03", "Fan"),
    r"^Light_Living(_|$)":   ("light01", "Light"),
    r"^Light_Dining(_|$)":   ("light02", "Light"),
    r"^Light_Bedroom(_|$)":  ("light03", "Light"),
    r"^Light_Bathroom(_|$)": ("light04", "Light"),
    r"^TV_Living(_|$)":      ("tele01", "Television"),
    r"^TV_Bedroom(_|$)":     ("tele02", "Television"),
    r"^Fridge(_|$)":         ("refrigerator01", "Refrigerator"),
    r"^Water_Heater(_|$)":   ("waterheater01", "Waterheater"),
}

ROOMS = [  # first match wins
    (r"bathroom|basin|shower|toilet|mirror|towel|bathmat|water_?heater", 4),
    (r"bedroom|^bed_|rug_bedroom", 3),
    (r"dining|^chair|fridge", 2),
    (r"living|sofa|coffeetable|^book|staircase|rug_living", 1),
]

tagged_a = tagged_r = 0
for obj in bpy.data.objects:
    name = obj.name
    for pat, (aid, atype) in APPLIANCES.items():
        if re.search(pat, name, re.I):
            obj["applianceId"] = aid
            obj["applianceType"] = atype
            tagged_a += 1
            break
    for pat, rid in ROOMS:
        if re.search(pat, name, re.I):
            obj["roomId"] = rid
            tagged_r += 1
            break

print(f"Tagged {tagged_a} appliance objects and {tagged_r} room objects")

bpy.ops.export_scene.gltf(
    filepath=str(OUTPUT),
    export_format="GLB",
    export_extras=True,          # custom properties → glTF extras
    export_apply=True,           # apply modifiers
    export_yup=True,
    export_texcoords=True,
    export_normals=True,
    export_materials="EXPORT",
    export_cameras=False,
    export_lights=False,
    use_selection=False,
)
print(f"Exported {OUTPUT}")
