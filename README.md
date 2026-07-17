# DocMaster

**A Hierarchical Structure-Aware System for Document Analysis**

[Project Page](https://doc-master.github.io/) · [Paper](https://arxiv.org/abs/2607.08539) · [Demo](https://doc-master.github.io/demo.html) · [Video](https://doc-master.github.io/video.html)

DocMaster is a structure-aware document analysis system for filtering and analyzing complex document collections. It preserves document hierarchy and layout in tree-based representations, builds multi-view semantic indices, and supports natural-language filtering followed by retrieval-augmented question answering.

![DocMaster workflow](figures/pipeline.jpg)

## Highlights

- Hierarchical document trees that preserve sections, tables, figures, and equations.
- Structure-aware and hyperedge-based retrieval for accurate document filtering.
- Token-efficient top-down traversal with early pruning of irrelevant content.
- Interactive filtering and follow-up question answering across document collections.

## Project Website

This repository hosts the official DocMaster project website. To preview it locally:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` in a browser.

## Citation

If you find DocMaster useful, please cite our paper:

```bibtex
@article{chen2026docmaster,
  title   = {DocMaster: A Hierarchical Structure-Aware System for Document Analysis},
  author  = {Chen, Ziqi and Zhou, Yingli and Zhang, Fangyuan and Xu, Quanqing and Yang, Chuanhui and Fang, Yixiang},
  journal = {arXiv preprint arXiv:2607.08539},
  year    = {2026}
}
```

