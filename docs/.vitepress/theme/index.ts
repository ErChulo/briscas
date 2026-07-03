import DefaultTheme from 'vitepress/theme';
import { nextTick, onMounted, watch } from 'vue';
import { useRoute } from 'vitepress';
import './mermaid.css';

export default {
  extends: DefaultTheme,
  setup() {
    const route = useRoute();

    async function renderMermaidBlocks() {
      await nextTick();
      const blocks = Array.from(document.querySelectorAll<HTMLElement>('.language-mermaid'));
      if (blocks.length === 0) {
        return;
      }

      const { default: mermaid } = await import('mermaid');
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'default' });

      await Promise.all(
        blocks.map(async (block, index) => {
          const code = block.querySelector('code')?.textContent;
          if (!code) {
            return;
          }

          const id = `mermaid-${route.path.replace(/\W+/g, '-')}-${index}`;
          const { svg } = await mermaid.render(id, code);
          const rendered = document.createElement('div');
          rendered.className = 'mermaid-rendered';
          rendered.innerHTML = svg;
          block.replaceWith(rendered);
        }),
      );
    }

    onMounted(() => {
      void renderMermaidBlocks();
    });

    watch(
      () => route.path,
      () => {
        window.setTimeout(() => void renderMermaidBlocks(), 0);
      },
    );
  },
};
