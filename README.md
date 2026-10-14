# Secure Software Systems - Git Practice

This repository is for practising GitHub collaboration before working on our Assignment 3 project.

We will use it to understand branches, commits, pull requests and merging changes.

This is a practice repository only.


## GitHub Workflow for Team Members

We will use this repository to practise GitHub collaboration before working on our main Secure Software Systems Assignment 3.

Each team member will work on their own branch, make changes, commit their work, and create a pull request before merging into the main branch.

### 1. Configure Git (First Time Only)

Use your own name and GitHub-linked email address.

```bash
git config --global user.name "Your Name"
git config --global user.email "your-github-email@example.com"
```

### 2. Clone the Repository

Run this in a terminal from the folder where you want to store the repository.

```bash
git clone https://github.com/Kartikeya2003/Secure-software-system-dummy.git
cd Secure-software-system-dummy
```

### 3. Create Your Own Branch

First, make sure your local main branch is updated.

```bash
git switch main
git pull origin main
```

Create a separate branch for your work.

```bash
git switch -c feature/yourname-practice
```

Replace `yourname` with your own name.

### 4. Make Changes

Create or edit your assigned practice file.

Check which files have changed.

```bash
git status
```

### 5. Stage Your Changes

```bash
git add .
```

This prepares your changed files for the next commit.

### 6. Commit Your Changes

```bash
git commit -m "Add my GitHub practice contribution"
```

Use a meaningful commit message explaining what you changed.

### 7. Push Your Branch to GitHub

```bash
git push -u origin feature/yourname-practice
```

Replace `yourname` with your branch name.

### 8. Create a Pull Request

1. Open the GitHub repository.
2. Go to Pull Requests.
3. Click New pull request.
4. Select `main` as the base branch.
5. Select your feature branch as the compare branch.
6. Review the changes.
7. Click Create pull request.

### 9. Review and Merge

Another team member reviews the pull request.

Once approved, merge it into the main branch.

### 10. Update Your Local Repository

After the pull request is merged:

```bash
git switch main
git pull origin main
```

This downloads the latest changes from GitHub.

## Practice Branches

| Team Member | Branch Name |
|---|---|
| Krish | feature/krish-practice |
| Nivedita | feature/nivedita-practice |
| Suhani | feature/suhani-practice |
| Kartikeya | feature/kartikeya-practice |
| Lian | feature/lian-practice |

## Important Notes

- Everyone must use their own GitHub account and Git identity.
- Work on your own branch rather than directly on main.
- Commit actual changes with meaningful messages.
- Never upload passwords, private keys or .env files.
- Create a pull request before merging changes.
- Review changes before merging.
- GitHub records commit authors and file changes, allowing us to review individual contributions.
- This repository is only for practising GitHub collaboration.

bhyvh kn khc jgnmvc bkm
 inv