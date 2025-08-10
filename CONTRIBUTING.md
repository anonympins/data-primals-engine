# Contributing to Data Primals Engine

Hello and a huge thank you for your interest in `data-primals-engine`! 🎉

We're thrilled to see you want to help us build an even better tool. Every contribution, big or small, is valuable and appreciated. This document is here to guide you.

## Code of Conduct

To ensure a welcoming and collaborative environment, we expect all contributors to follow our Code of Conduct. In short: be respectful, constructive, and open-minded.

## How Can I Contribute?

There are many ways to contribute, and all are welcome:

### 🐛 Reporting Bugs

- **Check existing issues** to see if someone has already reported the same bug.
- If not, open a new issue.
- Describe the bug as precisely as possible:
  - How to reproduce it?
  - What was the expected behavior?
  - What is the actual behavior?
  - Include screenshots or logs if possible.

### 💡 Suggesting Enhancements

Have an idea for a new feature or an improvement?
- Open a new issue to discuss it.
- Clearly explain the "why": what problem does this feature solve?
- Describe the "how": how do you imagine it would work?

### ✍️ Creating a Module

Modules are the primary way to extend the engine's functionality. They can add new API endpoints, listen to events, or perform background tasks.

#### 1. File Structure

The recommended way to create a module is to add a new directory inside `src/modules/`. The engine will automatically discover it if you follow the conventions.

For a module named `greeter`:
```
+src/
+└── modules/
    •└── greeter/
    •   ├── index.js       # The module's entry point
    •   └── greeter-logic.js # (Optional) Other logic files
```
#### 2. The onInit function 
+ The entry point of your module (index.js) must export an async function called onInit :
```javascript
let engine, logger;
export async function onInit(defaultEngine) {
    engine = defaultEngine;
    logger = engine.getComponent(Logger);
    // ...
};
```
### 🚀 Submitting Pull Requests

If you're ready to write code, that's fantastic!

1.  **Find an issue**: Look for issues with the `good first issue` or `help wanted` labels. Comment on the issue to let us know you're working on it.
2.  **Fork the repository** to your own GitHub account.
3.  **Clone your fork** locally: `git clone https://github.com/YOUR_USERNAME/data-primals-engine.git`
4.  **Create a branch** for your changes: `git checkout -b feature/your-feature-name` or `fix/bug-description`.
5.  **Make your changes**. Be sure to follow the project's style conventions.
6.  **Start the development server** to test your changes: `npm run dev`.
7.  **Commit your changes** with a clear message: `git commit -m "feat: Add feature X"`. (We follow the Conventional Commits specification).
8.  **Push your branch** to your fork: `git push origin feature/your-feature-name`.
9.  **Open a Pull Request** from your fork to the original repository's `main` branch.
10. **Link your PR** to the corresponding issue.

### 📖 Improving Documentation

Good documentation is essential. If you find a typo, an unclear explanation, or think a section is missing, please don't hesitate to suggest a change!

---

## ✨ Our Awesome Contributors

This project wouldn't exist without the incredible people who have given their time and expertise. A huge thank you to each and every one of you!

<a href="https://github.com/anonympins/data-primals-engine/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=anonympins/data-primals-engine" />
</a>

*This list is updated automatically.*

---

Thanks again for your contribution! We can't wait to see what we'll build together.