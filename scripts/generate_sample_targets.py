#!/usr/bin/env python3
"""Create connected sample silhouettes without external downloads."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "targets"
S = 512


def canvas():
    image = Image.new("L", (S, S), 0)
    return image, ImageDraw.Draw(image)


def save(name, image):
    OUT.mkdir(parents=True, exist_ok=True)
    image.save(OUT / f"{name}.png")


def cat():
    im, d = canvas()
    d.ellipse((150, 190, 390, 410), fill=255)
    d.ellipse((105, 140, 245, 280), fill=255)
    d.polygon([(125, 175), (125, 72), (190, 150)], fill=255)
    d.polygon([(185, 150), (235, 72), (238, 190)], fill=255)
    d.ellipse((340, 210, 455, 335), fill=255)
    d.ellipse((75, 315, 210, 390), fill=255)
    d.rectangle((120, 335, 385, 405), fill=255)
    save("cat", im)


def bird():
    im, d = canvas()
    d.ellipse((145, 185, 390, 345), fill=255)
    d.ellipse((320, 135, 420, 235), fill=255)
    d.polygon([(400, 165), (482, 195), (400, 220)], fill=255)
    d.polygon([(175, 215), (40, 75), (245, 245)], fill=255)
    d.polygon([(175, 315), (80, 430), (250, 325)], fill=255)
    d.rectangle((250, 300, 275, 405), fill=255)
    save("bird", im)


def elephant():
    im, d = canvas()
    d.ellipse((105, 155, 405, 360), fill=255)
    d.ellipse((330, 145, 460, 280), fill=255)
    d.ellipse((285, 125, 410, 285), fill=255)
    d.rounded_rectangle((395, 220, 455, 420), radius=25, fill=255)
    for x in (145, 220, 330): d.rounded_rectangle((x, 300, x+55, 440), radius=18, fill=255)
    d.polygon([(105, 210), (55, 180), (115, 270)], fill=255)
    save("elephant", im)


def fish():
    im, d = canvas()
    d.ellipse((120, 160, 410, 355), fill=255)
    d.polygon([(145, 205), (35, 105), (65, 255), (35, 405), (150, 315)], fill=255)
    d.polygon([(245, 180), (305, 80), (330, 190)], fill=255)
    d.polygon([(240, 335), (310, 430), (335, 330)], fill=255)
    save("fish", im)


def teapot():
    im, d = canvas()
    d.ellipse((140, 190, 390, 385), fill=255)
    d.rectangle((185, 145, 345, 230), fill=255)
    d.ellipse((170, 120, 360, 185), fill=255)
    d.polygon([(145, 215), (45, 180), (65, 245), (165, 285)], fill=255)
    d.ellipse((330, 180, 485, 360), outline=255, width=48)
    d.rectangle((180, 370, 350, 410), fill=255)
    save("teapot", im)


def horse():
    im, d = canvas()
    d.ellipse((115, 205, 390, 365), fill=255)
    d.polygon([(305, 245), (345, 105), (405, 120), (420, 260)], fill=255)
    d.ellipse((345, 90, 445, 190), fill=255)
    d.polygon([(365, 105), (355, 40), (395, 95)], fill=255)
    d.polygon([(415, 105), (450, 50), (440, 130)], fill=255)
    for x in (145, 220, 330, 370): d.polygon([(x, 315), (x+42, 315), (x+30, 455), (x-5, 455)], fill=255)
    d.polygon([(125, 230), (45, 115), (75, 285)], fill=255)
    save("horse", im)


if __name__ == "__main__":
    for fn in (cat, bird, elephant, fish, teapot, horse): fn()
    print(OUT)
