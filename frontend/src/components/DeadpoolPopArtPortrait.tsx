import React from 'react';

/**
 * High-Detail Vintage Pop-Art Comic Book Bust Portrait of Deadpool.
 * Crafted to match the exact framing, 85% close-up bust scale, electric cyan
 * rim-lighting, oversized Ben-Day halftone background, and distressed comic
 * book aesthetic of the Homelander portrait.
 */
export const DeadpoolPopArtPortrait: React.FC<{ className?: string }> = ({
  className = 'w-full h-full',
}) => {
  return (
    <div
      className={`${className} relative overflow-hidden bg-[#FFF3B0] select-none`}
    >
      <svg
        viewBox="0 0 240 240"
        className="w-full h-full block"
        role="img"
        aria-label="Deadpool pop-art portrait"
      >
        <defs>
          {/* Oversized Ben-Day Halftone Dots (Electric Cyan on Bright Yellow) */}
          <pattern
            id="dp-bg-dots-cyan"
            x="0"
            y="0"
            width="12"
            height="12"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(-14)"
          >
            <circle cx="6" cy="6" r="4.1" fill="#00E5FF" opacity="0.88" />
          </pattern>

          {/* Secondary Ben-Day Halftone Dots (Hot Orange/Magenta Corner Gradient) */}
          <pattern
            id="dp-bg-dots-hot"
            x="0"
            y="0"
            width="10"
            height="10"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(-14)"
          >
            <circle cx="5" cy="5" r="3.4" fill="#FF2A85" opacity="0.55" />
          </pattern>

          {/* Fine Comic Skin/Suit Halftone Texture */}
          <pattern
            id="dp-suit-dots"
            x="0"
            y="0"
            width="5"
            height="5"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(22)"
          >
            <circle cx="2.5" cy="2.5" r="1.25" fill="#7A0010" opacity="0.48" />
          </pattern>

          {/* Cyan Rim-Light Halftone Texture (matches Homelander's cyan halftone face highlights) */}
          <pattern
            id="dp-cyan-halftone"
            x="0"
            y="0"
            width="4.5"
            height="4.5"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(15)"
          >
            <circle cx="2.2" cy="2.2" r="1.35" fill="#38F6F2" opacity="0.85" />
          </pattern>

          {/* Golden Yellow Halftone Texture for Armor & Buckles */}
          <pattern
            id="dp-gold-halftone"
            x="0"
            y="0"
            width="4.5"
            height="4.5"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(-18)"
          >
            <circle cx="2.2" cy="2.2" r="1.2" fill="#D97706" opacity="0.45" />
          </pattern>

          {/* Background Radial Pop Burst */}
          <radialGradient id="dp-pop-bg" cx="48%" cy="42%" r="68%">
            <stop offset="0%" stopColor="#FFF7C2" />
            <stop offset="58%" stopColor="#FFE135" />
            <stop offset="100%" stopColor="#FF9E00" />
          </radialGradient>

          {/* Crimson Suit Gradient */}
          <linearGradient id="dp-crimson-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FF2836" />
            <stop offset="50%" stopColor="#E1061B" />
            <stop offset="100%" stopColor="#8F0010" />
          </linearGradient>

          {/* Eye Glow Filter */}
          <filter id="dp-eye-flare" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* 1. VINTAGE POP-ART HALFTONE BACKGROUND */}
        <rect width="240" height="240" fill="url(#dp-pop-bg)" />
        <rect width="240" height="240" fill="url(#dp-bg-dots-cyan)" />
        <polygon points="0,0 135,0 0,145" fill="url(#dp-bg-dots-hot)" />
        <polygon points="240,95 240,240 110,240" fill="url(#dp-bg-dots-hot)" />

        {/* Dynamic Black Comic Action Spikes (Matching Homelander's background bursts) */}
        <g fill="#0A0A0D">
          <polygon points="0,32 54,68 0,54" />
          <polygon points="0,78 66,98 14,104 52,126 0,118" />
          <polygon points="34,0 58,48 44,0" />
          <polygon points="168,0 144,64 192,0" />
          <polygon points="240,18 164,82 240,48" />
          <polygon points="240,122 178,136 240,152" />
        </g>

        {/* Diagonal Magenta/Yellow Speed Slash Behind Right Shoulder (Like Homelander's cape energy) */}
        <polygon
          points="146,88 240,22 240,148 158,156"
          fill="#FF1E56"
          stroke="#0A0A0D"
          strokeWidth="4.5"
        />
        <path
          d="M 162,92 L 240,38 M 170,112 L 240,64 M 176,130 L 240,92"
          stroke="#0A0A0D"
          strokeWidth="4"
          strokeLinecap="round"
        />

        {/* 2. CROSSED TACTICAL KATANAS BEHIND SHOULDERS (Thick Inked Comic Style) */}
        <g stroke="#0A0A0D" strokeLinejoin="round" strokeLinecap="round">
          {/* Left Katana Hilt */}
          <g transform="translate(46, 54) rotate(-32)">
            <rect
              x="-8"
              y="-52"
              width="16"
              height="68"
              rx="2"
              fill="#14161D"
              strokeWidth="4.5"
            />
            {/* Red & Cyan Diamond Tsuka-Ito Cord Wrap */}
            <polygon points="0,-46 6,-39 0,-32 -6,-39" fill="#FF2836" strokeWidth="1.8" />
            <polygon points="0,-30 6,-23 0,-16 -6,-23" fill="#38F6F2" strokeWidth="1.8" />
            <polygon points="0,-14 6,-7 0,0 -6,-7" fill="#FF2836" strokeWidth="1.8" />
            {/* Gold Kashira Pommel & Tsuba Guard */}
            <rect x="-9" y="-56" width="18" height="7" rx="1.5" fill="#FFD21E" strokeWidth="3.5" />
            <rect x="-16" y="10" width="32" height="7" rx="2" fill="#FFD21E" strokeWidth="4" />
          </g>

          {/* Right Katana Hilt */}
          <g transform="translate(194, 54) rotate(32)">
            <rect
              x="-8"
              y="-52"
              width="16"
              height="68"
              rx="2"
              fill="#14161D"
              strokeWidth="4.5"
            />
            <polygon points="0,-46 6,-39 0,-32 -6,-39" fill="#FF2836" strokeWidth="1.8" />
            <polygon points="0,-30 6,-23 0,-16 -6,-23" fill="#38F6F2" strokeWidth="1.8" />
            <polygon points="0,-14 6,-7 0,0 -6,-7" fill="#FF2836" strokeWidth="1.8" />
            <rect x="-9" y="-56" width="18" height="7" rx="1.5" fill="#FFD21E" strokeWidth="3.5" />
            <rect x="-16" y="10" width="32" height="7" rx="2" fill="#FFD21E" strokeWidth="4" />
          </g>
        </g>

        {/* 3. HEROIC CLOSE-UP SHOULDERS, COLLAR & TACTICAL CHEST ARMOR (Y=134..240) */}
        <g>
          {/* Main Crimson Torso Base */}
          <path
            d="M -12,244 L -4,174 C 4,150 34,136 72,130 L 168,130 C 206,136 236,150 244,174 L 252,244 Z"
            fill="url(#dp-crimson-grad)"
            stroke="#0A0A0D"
            strokeWidth="5.5"
            strokeLinejoin="round"
          />
          <path
            d="M -12,244 L -4,174 C 4,150 34,136 72,130 L 168,130 C 206,136 236,150 244,174 L 252,244 Z"
            fill="url(#dp-suit-dots)"
          />

          {/* Cyan Pop-Art Rim Highlight on Left Shoulder & Chest */}
          <path
            d="M 0,178 C 10,154 38,140 72,134 L 84,154 C 46,162 22,184 14,236 L -8,236 Z"
            fill="url(#dp-cyan-halftone)"
          />

          {/* Black & Charcoal Tactical Shoulder Pauldrons */}
          <path
            d="M -6,178 C 4,152 30,138 64,134 L 52,242 L -12,242 Z"
            fill="#141722"
            stroke="#0A0A0D"
            strokeWidth="5"
          />
          <path
            d="M 246,178 C 236,152 210,138 176,134 L 188,242 L 252,242 Z"
            fill="#141722"
            stroke="#0A0A0D"
            strokeWidth="5"
          />
          {/* Cyan Rim Highlight on Pauldron Ridges */}
          <path
            d="M 4,184 C 14,162 34,148 58,142"
            fill="none"
            stroke="#38F6F2"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path
            d="M 234,184 C 224,162 204,148 180,142"
            fill="none"
            stroke="#38F6F2"
            strokeWidth="3.5"
            strokeLinecap="round"
          />

          {/* Golden-Yellow Tactical Collar & Chest Strap Accents (Pop-Art Contrast like Homelander's gold eagles) */}
          <path
            d="M 68,128 L 94,184 L 120,192 L 146,184 L 172,128 L 154,124 L 120,168 L 86,124 Z"
            fill="#FFD21E"
            stroke="#0A0A0D"
            strokeWidth="4.5"
            strokeLinejoin="round"
          />
          <path
            d="M 68,128 L 94,184 L 120,192 L 146,184 L 172,128 L 154,124 L 120,168 L 86,124 Z"
            fill="url(#dp-gold-halftone)"
          />

          {/* Heavy Tactical Bandolier Straps Across Chest */}
          <path
            d="M 46,134 L 106,242 L 134,242 L 194,134"
            fill="none"
            stroke="#1B1E2B"
            strokeWidth="18"
          />
          <path
            d="M 46,134 L 106,242 M 194,134 L 134,242"
            fill="none"
            stroke="#0A0A0D"
            strokeWidth="5"
          />

          {/* Iconic Deadpool Red & Black Circular Belt/Sternum Emblem */}
          <g transform="translate(120, 204)">
            <circle
              cx="0"
              cy="0"
              r="22"
              fill="#0A0A0D"
              stroke="#FFD21E"
              strokeWidth="4"
            />
            <circle cx="0" cy="0" r="15" fill="#FF1E27" />
            <rect x="-3.5" y="-16" width="7" height="32" fill="#0A0A0D" />
            <ellipse cx="-8" cy="0" rx="3.5" ry="5.5" fill="#FFF" />
            <ellipse cx="8" cy="0" rx="3.5" ry="5.5" fill="#FFF" />
          </g>
        </g>

        {/* 4. MUSCULAR NECK & JAWLINE SHADOW */}
        <g>
          <path
            d="M 84,112 L 80,152 L 120,172 L 160,152 L 156,112 Z"
            fill="#9E0010"
            stroke="#0A0A0D"
            strokeWidth="5"
            strokeLinejoin="round"
          />
          {/* Deep Comic Ink Neck Tendons & Cross-Hatching */}
          <path
            d="M 94,124 L 104,160 M 146,124 L 136,160 M 120,136 L 120,168"
            stroke="#0A0A0D"
            strokeWidth="4.5"
            strokeLinecap="round"
          />
          <path
            d="M 88,132 L 102,138 M 86,142 L 102,148 M 152,132 L 138,138 M 154,142 L 138,148"
            stroke="#0A0A0D"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </g>

        {/* 5. HEROIC SCULPTED DEADPOOL HEAD & COWL (X=56..184, Y=18..154 — Large Close-Up Framing!) */}
        <g>
          {/* Cowl Top Knot / Ninja Hood Seam */}
          <path
            d="M 113,18 C 117,10 125,10 128,19 Z"
            fill="#E1061B"
            stroke="#0A0A0D"
            strokeWidth="4.5"
          />

          {/* Main Sculpted Crimson Head Silhouette */}
          <path
            d="M 120,16
               C 76,16 56,44 58,82
               C 59,108 68,128 84,142
               C 98,153 108,156 120,156
               C 132,156 142,153 156,142
               C 172,128 181,108 182,82
               C 184,44 164,16 120,16 Z"
            fill="url(#dp-crimson-grad)"
            stroke="#0A0A0D"
            strokeWidth="5.5"
            strokeLinejoin="round"
          />

          {/* Ben-Day Halftone Overlay on Cowl */}
          <path
            d="M 120,16
               C 76,16 56,44 58,82
               C 59,108 68,128 84,142
               C 98,153 108,156 120,156
               C 132,156 142,153 156,142
               C 172,128 181,108 182,82
               C 184,44 164,16 120,16 Z"
            fill="url(#dp-suit-dots)"
          />

          {/* Electric Cyan Pop-Art Rim-Light on Left Forehead, Cheekbone & Jaw (Matches Homelander!) */}
          <path
            d="M 116,20
               C 82,22 64,46 64,80
               C 65,104 74,124 90,138
               C 98,145 108,149 116,150
               C 100,136 92,114 92,84
               C 92,54 102,32 116,20 Z"
            fill="url(#dp-cyan-halftone)"
          />
          <path
            d="M 70,48 C 64,66 64,92 72,114"
            fill="none"
            stroke="#38F6F2"
            strokeWidth="4.5"
            strokeLinecap="round"
          />

          {/* Heavy Black Shadow on Right Side of Cowl for 3D Comic Depth */}
          <path
            d="M 152,26
               C 172,42 180,66 178,94
               C 176,118 164,136 144,148
               C 158,130 164,108 164,82
               C 164,56 160,38 152,26 Z"
            fill="#0A0A0D"
            opacity="0.72"
          />

          {/* Center Mask Seam & Brow Furrows */}
          <path
            d="M 120,17 L 120,154"
            stroke="#0A0A0D"
            strokeWidth="3.2"
            strokeDasharray="8 3"
          />

          {/* 6. ICONIC BLACK EYE PATCHES (Expressive Asymmetric Arch + Narrow Squint) */}
          {/* Left Eye Patch (Cocked Expressive Arch) */}
          <path
            d="M 67,68
               C 69,44 92,40 109,54
               C 114,60 114,84 107,95
               C 97,108 75,106 68,90
               C 65,83 65,75 67,68 Z"
            fill="#0D0F17"
            stroke="#0A0A0D"
            strokeWidth="5"
          />
          {/* Cyan Rim Reflection on Left Eye Patch */}
          <path
            d="M 71,66 C 75,50 92,46 105,56"
            fill="none"
            stroke="#38F6F2"
            strokeWidth="2.8"
            strokeLinecap="round"
          />

          {/* Right Eye Patch (Sharp Intense Tactical Squint) */}
          <path
            d="M 131,58
               C 146,46 169,48 173,68
               C 175,78 174,86 170,93
               C 162,106 141,106 132,93
               C 126,83 126,64 131,58 Z"
            fill="#0D0F17"
            stroke="#0A0A0D"
            strokeWidth="5"
          />
          <path
            d="M 135,58 C 148,50 164,52 169,66"
            fill="none"
            stroke="#38F6F2"
            strokeWidth="2.5"
            strokeLinecap="round"
          />

          {/* 7. GLOWING WHITE COMIC EYES WITH INTENSE LENS FLARE (Matches Homelander's Glowing Eye Intensity) */}
          <g filter="url(#dp-eye-flare)">
            {/* Left Eye: Wide Cocked Arch */}
            <path
              d="M 75,74 L 104,68 L 99,86 L 77,84 Z"
              fill="#FFFFFF"
              stroke="#0A0A0D"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            {/* Right Eye: Fierce Narrow Squint */}
            <path
              d="M 136,71 L 165,76 L 160,84 L 138,80 Z"
              fill="#FFFFFF"
              stroke="#0A0A0D"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            {/* Horizontal Pop-Art Eye Flare Streaks */}
            <path
              d="M 54,77 L 112,75"
              stroke="#38F6F2"
              strokeWidth="2.4"
              strokeLinecap="round"
              opacity="0.9"
            />
            <path
              d="M 128,76 L 188,79"
              stroke="#38F6F2"
              strokeWidth="2.4"
              strokeLinecap="round"
              opacity="0.9"
            />
          </g>

          {/* 8. SCULPTED BROW RIDGES, NOSE BRIDGE, SMIRKING MOUTH CONTOUR & CHIN */}
          {/* Angry/Sardonic Brow Ridges */}
          <path
            d="M 78,44 C 92,40 106,48 116,58"
            fill="none"
            stroke="#0A0A0D"
            strokeWidth="4.2"
            strokeLinecap="round"
          />
          <path
            d="M 162,46 C 148,44 134,50 124,58"
            fill="none"
            stroke="#0A0A0D"
            strokeWidth="4.2"
            strokeLinecap="round"
          />
          {/* Nose Bridge & Nostril Contours Under Fabric */}
          <path
            d="M 114,88 L 111,106 C 115,111 125,111 129,106 L 126,88"
            fill="#38F6F2"
            fillOpacity="0.35"
            stroke="#0A0A0D"
            strokeWidth="3.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Sardonic Fourth-Wall Smirk Crease Under Mask */}
          <path
            d="M 92,122 C 106,130 132,128 148,116"
            fill="none"
            stroke="#0A0A0D"
            strokeWidth="4.2"
            strokeLinecap="round"
          />
          <path
            d="M 144,111 C 150,114 152,120 148,125"
            fill="none"
            stroke="#0A0A0D"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          {/* Cheekbone & Chin Sculpted Ink Shading */}
          <path
            d="M 74,104 C 82,118 92,128 104,136"
            fill="none"
            stroke="#0A0A0D"
            strokeWidth="3.8"
            strokeLinecap="round"
          />
          <path
            d="M 166,104 C 158,118 148,128 136,136"
            fill="none"
            stroke="#0A0A0D"
            strokeWidth="3.8"
            strokeLinecap="round"
          />
          <path
            d="M 106,142 C 114,147 126,147 134,142"
            fill="none"
            stroke="#38F6F2"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
        </g>

        {/* 9. DISTRESSED VINTAGE COMIC PRINT EDGE (Matches Homelander's weathered white/ink edge) */}
        <rect
          x="2"
          y="2"
          width="236"
          height="236"
          fill="none"
          stroke="#FFFDF7"
          strokeWidth="3.5"
          strokeDasharray="48 6 24 4 80 5"
          opacity="0.85"
        />
      </svg>
    </div>
  );
};

export default DeadpoolPopArtPortrait;
