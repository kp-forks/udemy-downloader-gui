# Sync locales with template.json
# by @mirusu400
import json
import os

def update(filename):
    with open('template.json', 'r', encoding="utf-8") as f:
        template_data = json.load(f)

    with open(filename, 'r', encoding="utf-8") as f:
        ko_data = json.load(f)

    out_dict = {}
    for key in template_data.keys():
        if key in ko_data.keys():
            out_dict[key] = ko_data[key]
        else:
            out_dict[key] = template_data[key]

    with open(filename, 'w', encoding="utf-8") as f:
        json.dump(out_dict, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    for filename in os.listdir("./"):
        if filename.endswith(".json") and filename != "template.json" and filename != "meta.json":
            update(filename)