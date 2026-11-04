import React from 'react';

/**
 * Original vector pop-art portrait for the Deadpool persona.
 * Built as a single coherent illustration while retaining the app's comic halftone style.
 */
const DeadpoolPopArtPortrait: React.FC<{ className?: string }> = ({
  className = 'w-full h-full',
}) => (
  <div className={`${className} relative overflow-hidden bg-[#111]`}>
    <svg
      viewBox="0 0 1024 1024"
      role="img"
      aria-label="Deadpool pop-art portrait"
      className="w-full h-full"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern
          id="dp-yellow-dots"
          width="18"
          height="18"
          patternUnits="userSpaceOnUse"
        >
          <rect width="18" height="18" fill="#F6D82D" />
          <circle cx="4" cy="4" r="2.8" fill="#111" opacity=".55" />
        </pattern>
        <pattern
          id="dp-red-dots"
          width="14"
          height="14"
          patternUnits="userSpaceOnUse"
        >
          <rect width="14" height="14" fill="#E50914" />
          <circle cx="3" cy="3" r="2.2" fill="#8B0008" opacity=".7" />
        </pattern>
        <pattern
          id="dp-black-dots"
          width="12"
          height="12"
          patternUnits="userSpaceOnUse"
        >
          <rect width="12" height="12" fill="#17191F" />
          <circle cx="3" cy="3" r="2" fill="#050608" opacity=".8" />
        </pattern>
        <pattern
          id="dp-cyan-dots"
          width="16"
          height="16"
          patternUnits="userSpaceOnUse"
        >
          <rect width="16" height="16" fill="#00D5E8" />
          <circle cx="4" cy="4" r="2.5" fill="#006B79" opacity=".65" />
        </pattern>
        <linearGradient id="dp-mask" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FF4545" />
          <stop offset=".55" stopColor="#E50914" />
          <stop offset="1" stopColor="#A9000A" />
        </linearGradient>
        <linearGradient id="dp-blade" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFF" />
          <stop offset=".5" stopColor="#AAB6C5" />
          <stop offset="1" stopColor="#56616E" />
        </linearGradient>
        <filter id="dp-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="12" />
          <feOffset dx="12" dy="14" />
          <feComponentTransfer>
            <feFuncA type="linear" slope=".45" />
          </feComponentTransfer>
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect width="1024" height="1024" fill="url(#dp-yellow-dots)" />
      <path d="M0 0H270L0 300Z" fill="#00D5E8" opacity=".9" />
      <path d="M1024 0H760L1024 270Z" fill="#E50914" />
      <path d="M0 760L260 1024H0Z" fill="#00D5E8" />
      <path d="M1024 730L740 1024H1024Z" fill="#E50914" />
      <g stroke="#111" strokeWidth="13" opacity=".9">
        <path d="M50 0L0 50M130 0L0 130M1024 50L850 224M1024 150L930 244M0 850L170 1024M0 950L74 1024" />
      </g>

      {/* crossed katana blades and hilts */}
      <g filter="url(#dp-shadow)" stroke="#111" strokeLinejoin="round">
        <g transform="rotate(-31 310 520)">
          <path
            d="M300 65L337 65L360 710L318 710Z"
            fill="url(#dp-blade)"
            strokeWidth="12"
          />
          <path
            d="M318 710L360 710L349 760L329 760Z"
            fill="#BFC8D2"
            strokeWidth="10"
          />
          <rect
            x="290"
            y="742"
            width="82"
            height="24"
            rx="5"
            fill="#D6B24B"
            strokeWidth="10"
          />
          <rect
            x="320"
            y="762"
            width="24"
            height="176"
            rx="8"
            fill="#17191F"
            strokeWidth="10"
          />
          <path
            d="M322 785L342 808L322 831L342 854L322 877L342 900"
            fill="none"
            stroke="#E50914"
            strokeWidth="12"
          />
        </g>
        <g transform="rotate(31 714 520)">
          <path
            d="M680 65L717 65L740 710L698 710Z"
            fill="url(#dp-blade)"
            strokeWidth="12"
          />
          <path
            d="M698 710L740 710L729 760L709 760Z"
            fill="#BFC8D2"
            strokeWidth="10"
          />
          <rect
            x="670"
            y="742"
            width="82"
            height="24"
            rx="5"
            fill="#D6B24B"
            strokeWidth="10"
          />
          <rect
            x="700"
            y="762"
            width="24"
            height="176"
            rx="8"
            fill="#17191F"
            strokeWidth="10"
          />
          <path
            d="M702 785L722 808L702 831L722 854L702 877L722 900"
            fill="none"
            stroke="#E50914"
            strokeWidth="12"
          />
        </g>
      </g>

      {/* shoulders and torso */}
      <path
        d="M115 1024L145 790Q180 650 335 600L690 600Q850 650 884 790L914 1024Z"
        fill="url(#dp-red-dots)"
        stroke="#111"
        strokeWidth="24"
        strokeLinejoin="round"
        filter="url(#dp-shadow)"
      />
      <path
        d="M150 820Q200 650 345 625L410 770L260 900Z"
        fill="url(#dp-black-dots)"
        stroke="#111"
        strokeWidth="18"
      />
      <path
        d="M875 820Q820 650 680 625L615 770L765 900Z"
        fill="url(#dp-black-dots)"
        stroke="#111"
        strokeWidth="18"
      />
      <path
        d="M360 620L664 620L610 805L414 805Z"
        fill="#17191F"
        stroke="#111"
        strokeWidth="18"
      />
      <path
        d="M420 655L604 655L575 760L450 760Z"
        fill="#E50914"
        stroke="#050505"
        strokeWidth="10"
      />
      <circle
        cx="512"
        cy="705"
        r="42"
        fill="#111"
        stroke="#D9B64B"
        strokeWidth="9"
      />
      <path
        d="M512 667V743M474 705H550"
        stroke="#E50914"
        strokeWidth="10"
      />

      {/* neck */}
      <path
        d="M414 475L414 630Q512 692 610 630L610 475Z"
        fill="url(#dp-red-dots)"
        stroke="#111"
        strokeWidth="20"
      />

      {/* full cowl silhouette */}
      <g filter="url(#dp-shadow)">
        <path
          d="M512 92C390 92 318 190 324 348C330 500 407 596 512 630C617 596 694 500 700 348C706 190 634 92 512 92Z"
          fill="url(#dp-mask)"
          stroke="#111"
          strokeWidth="25"
        />
        <path
          d="M512 102C430 106 370 155 350 236L512 286Z"
          fill="#FF4A4A"
          opacity=".28"
        />
        <path
          d="M512 103V620"
          stroke="#8C0008"
          strokeWidth="8"
          strokeDasharray="13 12"
          opacity=".8"
        />
        <path
          d="M512 112L496 68L512 30L528 68Z"
          fill="#E50914"
          stroke="#111"
          strokeWidth="16"
          strokeLinejoin="round"
        />
        {/* eye patches */}
        <path
          d="M346 290C370 224 448 212 493 278C482 358 437 402 385 380C348 365 332 332 346 290Z"
          fill="#111"
          stroke="#050505"
          strokeWidth="12"
        />
        <path
          d="M678 290C654 224 576 212 531 278C542 358 587 402 639 380C676 365 692 332 678 290Z"
          fill="#111"
          stroke="#050505"
          strokeWidth="12"
        />
        {/* expressive white eyes */}
        <path
          d="M370 302Q420 263 472 302Q449 350 394 349Q372 335 370 302Z"
          fill="#FFF"
          stroke="#111"
          strokeWidth="10"
        />
        <path
          d="M552 302Q604 258 655 298Q652 341 612 351Q570 354 552 302Z"
          fill="#FFF"
          stroke="#111"
          strokeWidth="10"
        />
        <path
          d="M387 307Q422 292 452 310"
          fill="none"
          stroke="#D6DCE5"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <path
          d="M575 307Q612 287 640 305"
          fill="none"
          stroke="#D6DCE5"
          strokeWidth="8"
          strokeLinecap="round"
        />
        {/* subtle mask seams and cheek folds */}
        <path
          d="M350 410Q385 455 438 458M674 410Q639 455 586 458"
          fill="none"
          stroke="#8C0008"
          strokeWidth="9"
          strokeLinecap="round"
        />
        <path
          d="M430 485Q512 530 594 485"
          fill="none"
          stroke="#8C0008"
          strokeWidth="8"
          strokeLinecap="round"
        />
      </g>

      {/* foreground comic-book and mug */}
      <g filter="url(#dp-shadow)" stroke="#111" strokeWidth="18" strokeLinejoin="round">
        <path d="M115 850L460 795L478 1005H140Z" fill="#F6C90E" />
        <path d="M478 805L865 850L850 1005H478Z" fill="#FFF4D6" />
        <path d="M478 805V1005" strokeWidth="12" />
        <path
          d="M170 895L430 855M170 940L440 900M535 860L805 895M530 910L800 950"
          stroke="#E50914"
          strokeWidth="9"
        />
        <path
          d="M720 805H850V900Q850 940 810 940H760Q720 940 720 900Z"
          fill="#FFF"
        />
        <path
          d="M850 830Q930 815 922 875Q914 930 850 910"
          fill="none"
          strokeWidth="20"
        />
        <path
          d="M740 805Q785 765 830 805"
          fill="none"
          stroke="#D6D6D6"
          strokeWidth="10"
        />
      </g>
      <path
        d="M0 0H1024V1024H0Z"
        fill="none"
        stroke="#111"
        strokeWidth="28"
      />
    </svg>
  </div>
);

export default DeadpoolPopArtPortrait;
