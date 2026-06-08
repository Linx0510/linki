const fs = require('fs');

const LOGO_SVG = `<svg viewBox="0 0 445 416" fill="none" style="width:28px;height:28px;filter:drop-shadow(0 0 8px rgba(232,168,216,.5));">
      <path d="M 77 375 L 79 377 L 79 378 L 81 380 L 82 380 L 83 381 L 85 381 L 86 382 L 243 382 L 244 381 L 250 381 L 251 380 L 254 380 L 255 379 L 256 379 L 257 378 L 259 378 L 260 377 L 261 377 L 262 376 L 263 376 L 264 375 L 265 375 L 267 373 L 268 373 L 270 371 L 271 371 L 279 363 L 280 363 L 282 361 L 282 360 L 288 354 L 289 354 L 298 345 L 298 344 L 299 343 L 300 343 L 323 320 L 323 319 L 325 317 L 325 315 L 326 314 L 325 313 L 325 309 L 324 308 L 324 307 L 322 305 L 321 305 L 320 304 L 150 304 L 149 305 L 146 305 L 145 306 L 142 306 L 141 307 L 139 307 L 138 308 L 137 308 L 136 309 L 135 309 L 134 310 L 133 310 L 131 312 L 130 312 L 103 339 L 102 339 L 99 342 L 99 343 L 90 352 L 89 352 L 86 355 L 86 356 L 84 358 L 83 358 L 81 360 L 81 361 L 78 364 L 78 366 L 77 367 Z" fill="#f8ccf3"/>
      <path d="M 113 108 L 106 108 L 105 109 L 104 109 L 59 154 L 59 155 L 56 158 L 56 159 L 55 160 L 55 161 L 54 162 L 54 163 L 53 164 L 53 165 L 52 166 L 52 167 L 51 168 L 51 170 L 50 171 L 50 172 L 49 173 L 49 176 L 48 177 L 48 181 L 47 182 L 47 193 L 46 194 L 46 335 L 47 336 L 47 341 L 48 342 L 48 343 L 53 348 L 61 348 L 63 346 L 64 346 L 105 305 L 105 304 L 108 301 L 108 300 L 109 299 L 109 298 L 110 297 L 110 296 L 111 295 L 111 294 L 112 293 L 112 292 L 113 291 L 113 290 L 114 289 L 114 287 L 115 286 L 115 283 L 116 282 L 116 277 L 117 276 L 117 113 L 116 112 L 116 111 Z" fill="#f8ccf3"/>
      <path d="M 107 17 L 104 20 L 103 20 L 57 66 L 56 66 L 52 70 L 52 71 L 49 74 L 49 76 L 48 77 L 48 79 L 49 80 L 49 82 L 53 86 L 315 86 L 316 87 L 321 87 L 322 88 L 324 88 L 325 89 L 326 89 L 327 90 L 328 90 L 330 92 L 331 92 L 340 101 L 340 102 L 341 103 L 341 104 L 342 105 L 342 106 L 343 107 L 343 108 L 344 109 L 344 112 L 345 113 L 345 375 L 346 376 L 346 377 L 347 378 L 347 379 L 348 380 L 349 380 L 350 381 L 352 381 L 353 382 L 354 382 L 355 381 L 357 381 L 358 380 L 359 380 L 398 341 L 399 341 L 403 337 L 403 336 L 409 330 L 409 329 L 411 327 L 411 326 L 412 325 L 412 324 L 414 322 L 414 321 L 415 320 L 415 318 L 416 317 L 416 316 L 417 315 L 417 313 L 418 312 L 418 310 L 419 309 L 419 305 L 420 304 L 420 293 L 421 292 L 421 200 L 420 199 L 420 198 L 421 197 L 421 177 L 420 176 L 421 175 L 421 144 L 420 143 L 420 136 L 421 135 L 421 120 L 420 119 L 420 80 L 421 79 L 421 74 L 420 73 L 420 63 L 419 62 L 419 57 L 418 56 L 418 53 L 417 52 L 417 50 L 416 49 L 416 48 L 415 47 L 415 45 L 414 44 L 414 43 L 413 42 L 413 41 L 412 40 L 412 39 L 410 37 L 410 36 L 409 35 L 409 34 L 403 28 L 403 27 L 399 23 L 398 23 L 395 20 L 394 20 L 392 18 L 391 18 L 389 16 L 388 16 L 387 15 L 386 15 L 385 14 L 384 14 L 383 13 L 381 13 L 380 12 L 378 12 L 377 11 L 375 11 L 374 10 L 371 10 L 370 9 L 363 9 L 362 8 L 134 8 L 133 9 L 126 9 L 125 10 L 122 10 L 121 11 L 119 11 L 118 12 L 117 12 L 116 13 L 114 13 L 113 14 L 112 14 L 111 15 L 110 15 L 108 17 Z" fill="#f8ccf3"/>
    </svg>`;

const files = fs.readdirSync('.').filter(f => f.endsWith('.html'));

for (const file of files) {
  let content = fs.readFileSync(file, 'utf-8');
  
  if (!content.includes('class="mobile-header"')) continue;
  
  const isAdmin = file.startsWith('admin-');
  const href = isAdmin ? 'admin-dashboard.html' : 'index.html';
  
  const newBlock = `<div class="mobile-header">
  <button class="burger-btn" id="burgerBtn"><span class="burger-line"></span><span class="burger-line"></span><span class="burger-line"></span></button>
  <a href="${href}" style="display:flex;align-items:center;text-decoration:none;gap:8px;">
    ${LOGO_SVG}
    <span style="font-family:'Unbounded',sans-serif;font-size:18px;font-weight:900;color:var(--text);">АКТИВ</span>
  </a>
</div>`;
  
  // Заменяем mobile-header блок — ищем от <div class="mobile-header"> до ближайшего </div>
  const regex = /<div class="mobile-header">[\s\S]*?<\/div>/;
  const match = content.match(regex);
  if (!match) {
    console.log('SKIP (no match):', file);
    continue;
  }
  
  content = content.replace(regex, newBlock);
  fs.writeFileSync(file, content);
  console.log('OK:', file);
}
