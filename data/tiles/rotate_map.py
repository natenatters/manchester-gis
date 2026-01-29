#!/usr/bin/env python3
"""
Rotate historical map images for georeferencing.

Usage:
    python rotate_map.py <input.png> <angle_degrees> [output.png]

Example:
    python rotate_map.py berry_1650_original.png -15 berry_1650.png

Positive angle = counter-clockwise
Negative angle = clockwise
"""

import sys
from PIL import Image


def rotate_map(input_path, angle, output_path=None):
    """Rotate image and expand canvas to fit."""
    if output_path is None:
        output_path = input_path.replace('.png', '_rotated.png')

    print(f"Loading: {input_path}")
    img = Image.open(input_path)

    # Convert to RGBA if needed (for transparency in expanded areas)
    if img.mode != 'RGBA':
        img = img.convert('RGBA')

    print(f"Original size: {img.size}")
    print(f"Rotating {angle} degrees...")

    # Rotate with expand=True to fit the whole rotated image
    # Use BICUBIC for quality
    rotated = img.rotate(angle, expand=True, resample=Image.BICUBIC)

    print(f"Rotated size: {rotated.size}")
    print(f"Saving: {output_path}")

    rotated.save(output_path, 'PNG')
    print("Done!")

    return rotated.size


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    input_file = sys.argv[1]
    angle = float(sys.argv[2])
    output_file = sys.argv[3] if len(sys.argv) > 3 else None

    rotate_map(input_file, angle, output_file)
