-- Allow custom text colors to be represented by color_hex without requiring an image asset.
-- This fixes inserts where image_url is intentionally empty for color-dot based custom text colors.
alter table public.custom_option_colors
drop constraint if exists custom_option_colors_image_url_not_blank;