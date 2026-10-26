# Launch posts · SunPlot 3D (ImliStack)

Video: `docs/social/sunplot-x.mp4` (58 s, 1280×720, H.264, silent, captions burned in) and
`docs/social/sunplot-x-sound.mp4` (the same video with a soft ambient pad generated with ffmpeg, so there
are no music rights to clear). Both work on X and LinkedIn. To regenerate: `node scripts/social-video.mjs`.

---

## X / Twitter thread

Attach the video to tweet 1. Each tweet stays under 280 characters, with links counted as 23.

**1/3**
```
Solar installers in India pay ₹56k–1.1L a year for design software, and most still visit every roof with a tape measure ☀️

So I built a free one 🛠️

SunPlot 3D: pick any roof from satellite, see real shading in 3D, get wiring, payback and a PDF in minutes.

👇
```

**2/3**
```
Try it free, no login:
https://sunplot-3d.imlistack.workers.dev

🏠 Homes → 🏭 factories → ✈️ airports
🌦️ 10 years of NASA weather
🛰️ Find schools, hospitals and malls on the map
⚡ Strings, wiring diagram, BOM
💰 PM Surya Ghar subsidy, IRR, RESCO tariffs
```

**3/3**
```
Open source, built with React + Three.js, running on Cloudflare.

If it's useful: share it with someone in solar, and drop a ⭐ on GitHub 🙏
https://github.com/ImliStack/SunPlot-3D

What should it do next? 👇
— ImliStack · imlistack.com
```

**Single-tweet version** (if you don't want a thread):
```
Built a free solar planner for India ☀️

Pick a roof from satellite → 3D shading → wiring, payback, PM Surya Ghar subsidy and a client PDF. Homes to factories to airports.

https://sunplot-3d.imlistack.workers.dev

Open source, ⭐ on GitHub 🙏
by ImliStack · imlistack.com
```

---

## LinkedIn

Attach the same video. LinkedIn shows fewer people posts whose links sit high up, so this one tells the story first and puts the links near the end.

```
India wants 1 crore rooftop solar homes under PM Surya Ghar. Talking to installers, I kept hearing the same thing: the design tools are either expensive (₹56k–1.1 lakh a year) or too basic, and every quote still starts with a site visit and a tape measure. ☀️

So I built SunPlot 3D, a free solar planner that runs in your browser. No login, no install.

What it does:

🛰️ Survey without a visit. Search an address, or pick a school, hospital, mall or petrol pump on the map. The building outline comes from satellite data, with the stair room, tank and neighbours.
🌦️ Real weather. Ten years of NASA data per location, with rain, dust, snow and heat losses, and P50 and P90 yields.
🌳 Real shading. Every module is ray-cast against trees, rows, tanks and nearby buildings across the whole year.
🏭 Every kind of roof. Homes (RCC terraces, Mangalore tiles), multi-span factory sheds with skylights and walkways, campuses with many blocks, carports, airports and ground mounts.
⚡ Electrical design. Inverters, strings checked against the site's record cold and heat, a single-line diagram, cable sizes, protection, DG sync and a bill of materials.
💰 Money that matches India. The PM Surya Ghar and housing-society subsidy, business payback after tax with 40% depreciation, loans and EMI, and zero-capex RESCO tariffs. Bills are matched hour by hour, with net metering or net billing and ToD tariffs.
📄 Ready to send. A branded PDF proposal, CAD layout, 3D model, an orbit video and a read-only customer link.

I studied Arka360, OpenSolar, Aurora and Solar Ladder before building it, and the full gap analysis is in the repo. It's a concept tool, not a stamped engineering design, but it gets an installer from "can you quote my roof?" to a credible proposal in minutes.

Try it: https://sunplot-3d.imlistack.workers.dev
Code (open source): https://github.com/ImliStack/SunPlot-3D

If you find it useful, I'd love three small things 🙏
☀️ Try it on your own roof and tell me what it got right or wrong
🤝 Share it with someone in solar: an installer, an EPC or a student
⭐ Star it on GitHub. It really helps open-source work get seen

What should it do next: CRM and quotes, Hindi, or a mobile survey app? Tell me in the comments 👇

Built under ImliStack: https://imlistack.com

#Solar #RooftopSolar #PMSuryaGhar #CleanEnergy #India #OpenSource #ThreeJS #WebDevelopment #BuildInPublic
```

---

**Before posting:** open the live link in a private window to check it loads. If ImliStack has an X handle,
replace "ImliStack" in tweet 3 with the @handle. The ₹56k–1.1L figure is Arka360's published India pricing
(Lite to Premium, plus GST, Oct 2026).
