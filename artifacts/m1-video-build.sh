#!/bin/zsh
set -euo pipefail

out_dir=/tmp/tastes-m1/edit
mkdir -p "$out_dir"
font=/System/Library/Fonts/Supplemental/Arial.ttf

make_card() {
  local text="$1" out="$2" duration="$3"
  local fade_out
  fade_out=$(python3 -c "print(max(0, float('${duration}')-.45))")
  ffmpeg -hide_banner -loglevel error -f lavfi -i "color=c=0x090909:s=1080x1080:r=30:d=${duration}" \
    -vf "drawtext=fontfile=${font}:text='${text}':fontcolor=white:fontsize=62:x=(w-text_w)/2:y=(h-text_h)/2-18,fade=t=in:st=0:d=0.45,fade=t=out:st=${fade_out}:d=0.45" \
    -an -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p "$out" -y
}

make_clip() {
  local input="$1" out="$2" start="$3" duration="$4" speed="${5:-1}"
  local fade_out
  fade_out=$(python3 -c "print(max(0, float('${duration}')/float('${speed}')-.45))")
  ffmpeg -hide_banner -loglevel error -ss "$start" -t "$duration" -i "$input" \
    -vf "scale=1080:1080:force_original_aspect_ratio=decrease,pad=1080:1080:(ow-iw)/2:(oh-ih)/2:black,fps=30,setpts=PTS/${speed},setsar=1,fade=t=in:st=0:d=0.45,fade=t=out:st=${fade_out}:d=0.45" \
    -an -c:v libx264 -preset medium -crf 19 -pix_fmt yuv420p "$out" -y
}

make_card "TASTES  •  MILESTONE 1" "$out_dir/00-title.mp4" 3.0
make_card "ONBOARDING & AUTHENTICATION" "$out_dir/01-auth-title.mp4" 2.0
make_clip /tmp/tastes-v6/auth-intro.mp4 "$out_dir/02-auth-intro.mp4" 9 12.5 1
make_clip /tmp/tastes-v6/auth-otp-profile.mp4 "$out_dir/03-auth-otp.mp4" 0 37.4 1.25
make_clip /tmp/tastes-v6/onboarding-readable.mp4 "$out_dir/04-onboarding.mp4" 0 52.7 1.25
make_card "PROFILE & USER MANAGEMENT" "$out_dir/05-profile-title.mp4" 2.0
make_clip /tmp/tastes-m1/profile-remote-clean.mov "$out_dir/06-profile-rewards.mp4" 0 31.0 1.15
make_clip /tmp/tastes-m1/settings-take.mov "$out_dir/07-settings.mp4" 0 17.0
make_clip /tmp/tastes-m1/settings-take.mov "$out_dir/08-profile-map.mp4" 46 18.0
make_clip /tmp/tastes-m1/wishlist-fixed.mov "$out_dir/09-wishlist.mp4" 0 18.0
make_card "MILESTONE 1  •  COMPLETE" "$out_dir/10-end.mp4" 2.5

list="$out_dir/concat.txt"
: > "$list"
for f in "$out_dir"/{00-title,01-auth-title,02-auth-intro,03-auth-otp,04-onboarding,05-profile-title,06-profile-rewards,07-settings,08-profile-map,09-wishlist,10-end}.mp4; do
  print -r -- "file '$f'" >> "$list"
done

ffmpeg -hide_banner -loglevel error -f concat -safe 0 -i "$list" -c copy \
  /Users/vadimkassin/Not_Cloud/tastes/artifacts/tastes-milestone-1-visual-preview.mp4 -y
