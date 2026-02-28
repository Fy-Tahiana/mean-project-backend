# Global-CCP 🚀

Welcome to **Global-CCP**!  
This project is built with Node.js and is open for collaboration.

This README will help you get started quickly and explain how to contribute properly.

---

## Getting Started

### 1. Clone the repository
```bash
git clone https://github.com/D3ds3c007/Global-CCP
cd Global-CCP
```

### 2. Install dependencies
```bash
npm install
``` 
### 3. Start the project in development mode
```bash
npm run dev
``` 

# Project Workflow (Important)
We follow a simple and clean Git workflow:

main → production branch (do not push directly)

develop → integration branch

feature/* → your personal feature branches

# How to Contribute

### 1. Always create your own branch
Never work directly on main or develop.
```bash
git checkout develop
git pull
git checkout -b feature/your-feature-name
``` 
Example:
```bash
git checkout -b feature/auth-login
```
### 2. Work on your feature
```bash
git add .
git commit -m "Add login functionality"
```
### 3. Push your branch
```bash
git push origin feature/your-feature-name
```
### 4. Create a Pull Request (PR)
On GitHub:

- Open a Pull Request

- Source: feature/your-feature-name

- Target: develop

# After review, your code will be merged into develop.

# Rules & Good Practices
1. Do not push directly to main
2. Do not push directly to develop
3. One feature = one branch
4. Write clear commit messages

5. Test your code before creating a PR

# Need Help?
If something is unclear:

Ask in the team group

Or open an issue on GitHub

Happy coding and welcome to the team! 👨‍💻🔥
