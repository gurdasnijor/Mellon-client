export type CodeTemplate = {
  id: string;
  label: string;
  description: string;
  sourceUrl: string;
  code: string;
};

export const CODE_TEMPLATES: CodeTemplate[] = [
  {
    id: 'florence2-annotator',
    label: 'Florence2 image annotator',
    description: 'Quick remote-code smoke test that produces a segmentation overlay.',
    sourceUrl: 'https://huggingface.co/diffusers/Florence2-image-Annotator',
    code: `import torch
from diffusers import ModularPipeline
from diffusers.utils import load_image

pipe = ModularPipeline.from_pretrained(
    "diffusers/Florence2-image-Annotator",
    trust_remote_code=True,
)
pipe.load_components(torch_dtype=torch.bfloat16)
pipe.to("cuda")

image = load_image(
    "https://huggingface.co/datasets/huggingface/"
    "documentation-images/resolve/main/transformers/tasks/car.jpg"
).resize((1024, 1024))

output = pipe(
    image=image,
    annotation_task="<REFERRING_EXPRESSION_SEGMENTATION>",
    annotation_prompt="the car",
    annotation_output_type="mask_overlay",
).images[0]

output.save("car-mask.png")
`,
  },
  {
    id: 'flux2-multidiffusion',
    label: 'FLUX.2 MultiDiffusion',
    description: 'Tiled FLUX.2 generation with component management and automatic CPU offload.',
    sourceUrl: 'https://huggingface.co/arlaz/modular-flux2-multidiffusion',
    code: `import torch
from diffusers import ComponentsManager, ModularPipeline

manager = ComponentsManager()
manager.enable_auto_cpu_offload(device="cuda")

pipe = ModularPipeline.from_pretrained(
    "arlaz/modular-flux2-multidiffusion",
    trust_remote_code=True,
    components_manager=manager,
)
pipe.load_components(torch_dtype=torch.bfloat16)

output = pipe(
    prompt="a dense renaissance fresco",
    height=1024,
    width=1024,
    height_generation=512,
    width_generation=512,
    window_stride_height=512,
    window_stride_width=512,
    weighting_type="cosine",
    num_inference_steps=1,
    batch_size=1,
    generator=torch.Generator().manual_seed(42),
)

output.images[0].save("flux2-multidiffusion.png")
`,
  },
  {
    id: 'sdxl-upscale',
    label: 'SDXL tiled upscale',
    description: 'A 2x tiled SDXL upscale without the optional ControlNet dependency.',
    sourceUrl: 'https://huggingface.co/akshan-main/modular-sdxl-upscale',
    code: `import torch
from diffusers import ModularPipeline
from diffusers.utils import load_image

pipe = ModularPipeline.from_pretrained(
    "akshan-main/modular-sdxl-upscale",
    trust_remote_code=True,
)
pipe.load_components(torch_dtype=torch.float16)
pipe.to("cuda")

image = load_image(
    "https://huggingface.co/datasets/huggingface/"
    "documentation-images/resolve/main/diffusers/yarn-art-pikachu.png"
).convert("RGB")

result = pipe(
    prompt="high quality, detailed, sharp",
    image=image,
    upscale_factor=2.0,
    strength=0.15,
    auto_strength=False,
    num_inference_steps=20,
    output="images",
)

result[0].save("sdxl-upscaled.png")
`,
  },
  {
    id: 'qwen-image-layered',
    label: 'Qwen Image Layered',
    description: 'Decomposes one source image into multiple transparent image artifacts.',
    sourceUrl: 'https://huggingface.co/diffusers/Qwen-Image-Layered-modular',
    code: `import torch
from diffusers import ModularPipeline
from diffusers.utils import load_image

pipe = ModularPipeline.from_pretrained(
    "diffusers/Qwen-Image-Layered-modular",
)
pipe.load_components(torch_dtype=torch.bfloat16)
pipe.to("cuda")

image = load_image(
    "https://huggingface.co/datasets/huggingface/"
    "documentation-images/resolve/main/diffusers/yarn-art-pikachu.png"
).convert("RGBA")

result = pipe(
    image=image,
    prompt="",
    num_inference_steps=50,
    layers=4,
    resolution=640,
    use_en_prompt=True,
)

layers = result.images[0]
for index, layer in enumerate(layers):
    layer.save(f"layer-{index}.png")
`,
  },
  {
    id: 'krea-realtime-video',
    label: 'Krea realtime video · heavy',
    description: 'A stateful 14B text-to-video run that exports an MP4.',
    sourceUrl: 'https://huggingface.co/krea/krea-realtime-video',
    code: `import torch
from diffusers import ModularPipeline
from diffusers.modular_pipelines import PipelineState
from diffusers.utils import export_to_video

pipe = ModularPipeline.from_pretrained(
    "krea/krea-realtime-video",
    trust_remote_code=True,
)
pipe.load_components(
    trust_remote_code=True,
    device_map="cuda",
    torch_dtype={"default": torch.bfloat16, "vae": torch.float16},
)

for block in pipe.transformer.blocks:
    block.self_attn.fuse_projections()

frames = []
state = PipelineState()
generator = torch.Generator(device=pipe.device).manual_seed(42)
num_blocks = 9

for block_index in range(num_blocks):
    state = pipe(
        state,
        prompt=["a cat sitting on a boat"],
        num_inference_steps=6,
        num_blocks=num_blocks,
        block_idx=block_index,
        generator=generator,
    )
    frames.extend(state.values["videos"][0])

export_to_video(frames, "krea-realtime-video.mp4", fps=24)
`,
  },
  {
    id: 'waypoint-1-5',
    label: 'Waypoint 1.5 · needs tensordict',
    description: 'Interactive world-model loop; requires tensordict in the Mellon runtime.',
    sourceUrl: 'https://huggingface.co/Overworld/Waypoint-1.5-1B',
    code: `# Runtime requirement: tensordict
import torch
from diffusers.modular_pipelines import ModularPipeline
from diffusers.utils import export_to_video, load_image

pipe = ModularPipeline.from_pretrained(
    "Overworld/Waypoint-1.5-1B",
    trust_remote_code=True,
)
pipe.load_components(
    device_map="cuda",
    torch_dtype=torch.bfloat16,
    trust_remote_code=True,
)
pipe.transformer.apply_inference_patches()
pipe.transformer.compile(
    fullgraph=True,
    mode="max-autotune",
    dynamic=False,
)

image = load_image(
    "https://huggingface.co/spaces/Overworld/"
    "waypoint-1-small/resolve/main/starter_18.png"
).resize((1024, 512))

state = pipe(
    image=image,
    prompt="An explorable world",
    button=set(),
    mouse=(0.0, 0.0),
    output_type="pil",
)

state.values["image"] = None
frames = []
for _ in range(30):
    state = pipe(
        state,
        button={87},
        mouse=(0.0, 0.0),
        output_type="pil",
    )
    frames.extend(state.values["images"])

export_to_video(frames, "waypoint-v1-5.mp4", fps=60)
`,
  },
  {
    id: 'matrix-game-2',
    label: 'Matrix Game 2 · needs flash-attn',
    description: 'Action-conditioned video; requires a compatible flash-attn runtime.',
    sourceUrl: 'https://huggingface.co/diffusers/matrix-game-2-modular',
    code: `# Runtime requirement: flash-attn
import torch
from diffusers import ModularPipelineBlocks
from diffusers.modular_pipelines import WanModularPipeline
from diffusers.utils import export_to_video, load_image


class MatrixGameWanModularPipeline(WanModularPipeline):
    @property
    def default_sample_height(self):
        return 44

    @property
    def default_sample_width(self):
        return 80


repo_id = "diffusers/matrix-game-2-modular"
blocks = ModularPipelineBlocks.from_pretrained(
    repo_id,
    trust_remote_code=True,
)
pipe = MatrixGameWanModularPipeline(blocks, repo_id)
pipe.load_components(
    trust_remote_code=True,
    device_map="cuda",
    torch_dtype={"default": torch.bfloat16, "vae": torch.float32},
)

image = load_image(
    "https://github.com/SkyworkAI/Matrix-Game/blob/main/"
    "Matrix-Game-2/demo_images/universal/0016.png?raw=true"
)
output = pipe(
    image=image,
    actions=["forward", "camera_l"],
    num_frames=141,
)
export_to_video(output.values["videos"][0], "matrix-game.mp4")
`,
  },
];

export const DEFAULT_CODE_TEMPLATE = CODE_TEMPLATES[0];
