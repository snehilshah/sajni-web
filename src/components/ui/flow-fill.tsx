import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

// A living fill: four colours folded into soft swells that drift forward,
// like warm air or slow gas (the phone's `flowFill`, same shader). Time runs
// on and nothing loops, so there are no bands and no seam. Max priority's
// fill and a task being finished wear it. Fills its positioned parent.
// Reduced motion: one still frame. No WebGL: a plain gradient.

const VERT = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
const FRAG = `precision mediump float;
uniform vec2 size;uniform float time;uniform vec3 c0;uniform vec3 c1;uniform vec3 c2;uniform vec3 c3;
void main(){
  vec2 xy=vec2(gl_FragCoord.x,size.y-gl_FragCoord.y);
  vec2 p=xy/size.y*0.85;
  p.x-=time*0.6;
  for(int i=1;i<4;i++){float k=float(i);
    p.x+=0.34/k*sin(k*1.9*p.y+0.8*time+0.5*k);
    p.y+=0.30/k*cos(k*1.5*p.x-0.5*time+0.9*k);}
  float f=0.5+0.5*sin(p.x*1.5+p.y*0.8);
  float g=0.5+0.5*sin(p.x*0.8-p.y*1.3+1.7);
  vec3 a=mix(c0,c1,smoothstep(0.,1.,f));
  vec3 b=mix(c2,c3,smoothstep(0.,1.,f));
  vec3 col=mix(a,b,smoothstep(0.15,0.85,g));
  col*=0.93+0.12*g;
  gl_FragColor=vec4(clamp(col,0.,1.),1.);
}`;

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h.slice(0, 6), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function FlowFill({ colors, className }: { colors: string[]; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = colors.join(',');
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { antialias: false, premultipliedAlpha: false });
    if (!gl) {
      canvas.style.background = `linear-gradient(90deg, ${key})`;
      return;
    }
    const shader = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const cs = key.split(',');
    ['c0', 'c1', 'c2', 'c3'].forEach((name, i) =>
      gl.uniform3fv(gl.getUniformLocation(prog, name), rgb(cs[Math.min(i, cs.length - 1)])),
    );
    const uSize = gl.getUniformLocation(prog, 'size');
    const uTime = gl.getUniformLocation(prog, 'time');

    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    const draw = (t: number) => {
      gl.uniform2f(uSize, canvas.width, canvas.height);
      gl.uniform1f(uTime, t);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    fit();
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const start = performance.now();
    const loop = (now: number) => {
      draw((now - start) / 1000);
      raf = requestAnimationFrame(loop);
    };
    if (still) draw(2);
    else raf = requestAnimationFrame(loop);
    const ro = new ResizeObserver(() => {
      fit();
      if (still) draw(2);
    });
    ro.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [key]);
  return <canvas ref={ref} aria-hidden className={cn('pointer-events-none absolute inset-0 size-full', className)} />;
}
