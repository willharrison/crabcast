import { useState, useEffect, useCallback } from "react";
import type { DirEntry, SSHConnection } from "../../shared/types.js";

interface Props {
  cwd: string;
  ssh?: SSHConnection;
  onClose: () => void;
}

interface TreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: TreeNode[];
  expanded?: boolean;
  loading?: boolean;
}

type GitStatuses = Record<string, string>;

export function DirectoryExplorer({ cwd, ssh, onClose }: Props) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [gitUrl, setGitUrl] = useState<string | null>(null);
  const [gitBranch, setGitBranch] = useState<string>("main");
  const [gitStatuses, setGitStatuses] = useState<GitStatuses>({});

  useEffect(() => {
    loadDir(cwd).then(setTree);
    if (!ssh) {
      window.electronAPI.getGitRemoteUrl(cwd).then(setGitUrl);
      window.electronAPI.getGitInfo(cwd).then((info) => {
        if (info?.branch) setGitBranch(info.branch);
      });
      window.electronAPI.getGitFileStatuses(cwd).then(setGitStatuses);
    }
  }, [cwd, ssh]);

  // Refresh git statuses periodically
  useEffect(() => {
    if (ssh) return;
    const interval = setInterval(() => {
      window.electronAPI.getGitFileStatuses(cwd).then(setGitStatuses);
    }, 5000);
    return () => clearInterval(interval);
  }, [cwd, ssh]);

  const loadDir = useCallback(async (dirPath: string): Promise<TreeNode[]> => {
    try {
      let entries: DirEntry[];
      if (ssh) {
        entries = await window.electronAPI.sshListDir(ssh, dirPath);
      } else {
        entries = await window.electronAPI.listDir(dirPath);
      }
      return entries
        .filter((e) => e.name !== "." && e.name !== "..")
        .map((e) => ({
          name: e.name,
          path: dirPath + "/" + e.name,
          isDirectory: e.isDirectory,
        }));
    } catch {
      return [];
    }
  }, [ssh]);

  const toggleDir = useCallback(async (nodePath: string) => {
    let wasExpanded = false;
    setTree((prev) => updateTree(prev, nodePath, (node) => {
      wasExpanded = !!node.expanded;
      if (node.expanded) {
        return { ...node, expanded: false };
      }
      return { ...node, expanded: true, loading: true };
    }));

    if (wasExpanded) return;

    const children = await loadDir(nodePath);
    setTree((prev) => updateTree(prev, nodePath, (node) => ({
      ...node,
      children,
      loading: false,
      expanded: true,
    })));
  }, [loadDir]);

  const getRelativePath = useCallback((filePath: string) => {
    return filePath.startsWith(cwd) ? filePath.slice(cwd.length + 1) : filePath;
  }, [cwd]);

  const openInVSCode = useCallback((filePath: string) => {
    window.open(`vscode://file${filePath}`);
  }, []);

  const openOnGitHub = useCallback((filePath: string) => {
    if (!gitUrl) return;
    const relativePath = getRelativePath(filePath);
    window.electronAPI.openExternal(`${gitUrl}/blob/${gitBranch}/${relativePath}`);
  }, [gitUrl, gitBranch, getRelativePath]);

  const getFileGitStatus = useCallback((filePath: string): string | undefined => {
    const rel = getRelativePath(filePath);
    return gitStatuses[rel];
  }, [gitStatuses, getRelativePath]);

  const isTrackedOnRemote = useCallback((filePath: string): boolean => {
    if (!gitUrl) return false;
    const status = getFileGitStatus(filePath);
    if (status === "?" || status === "A" || status === "D") return false;
    return true;
  }, [gitUrl, getFileGitStatus]);

  return (
    <div style={styles.container}>
      <div style={styles.titleBar}>
        <span style={styles.title}>Files</span>
        <button onClick={onClose} className="close-btn" style={styles.closeBtn}>
          &times;
        </button>
      </div>

      <div style={styles.body}>
        {tree.length === 0 && (
          <div style={styles.loading}>Loading...</div>
        )}
        {tree.map((node) => (
          <TreeItem
            key={node.path}
            node={node}
            depth={0}
            onToggle={toggleDir}
            onOpenVSCode={openInVSCode}
            onOpenGitHub={isTrackedOnRemote(node.path) ? openOnGitHub : undefined}
            getGitStatus={getFileGitStatus}
            isTrackedOnRemote={isTrackedOnRemote}
          />
        ))}
      </div>
    </div>
  );
}

function updateTree(
  nodes: TreeNode[],
  targetPath: string,
  updater: (node: TreeNode) => TreeNode
): TreeNode[] {
  return nodes.map((node) => {
    if (node.path === targetPath) return updater(node);
    if (node.children && targetPath.startsWith(node.path + "/")) {
      return { ...node, children: updateTree(node.children, targetPath, updater) };
    }
    return node;
  });
}

interface TreeItemProps {
  node: TreeNode;
  depth: number;
  onToggle: (path: string) => void;
  onOpenVSCode: (path: string) => void;
  onOpenGitHub?: (path: string) => void;
  getGitStatus: (path: string) => string | undefined;
  isTrackedOnRemote: (path: string) => boolean;
}

function TreeItem({ node, depth, onToggle, onOpenVSCode, onOpenGitHub, getGitStatus, isTrackedOnRemote }: TreeItemProps) {
  const [hovered, setHovered] = useState(false);
  const gitStatus = getGitStatus(node.path);

  return (
    <>
      <div
        className="tree-row"
        style={{
          ...styles.item,
          paddingLeft: 12 + depth * 16,
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {node.isDirectory ? (
          <button
            onClick={() => onToggle(node.path)}
            style={styles.itemBtn}
          >
            <span style={styles.arrow}>
              {node.loading ? "·" : node.expanded ? "▾" : "▸"}
            </span>
            <span style={styles.dirName}>{node.name}</span>
          </button>
        ) : (
          <div style={styles.fileRow}>
            <span style={{ ...styles.arrow, visibility: "hidden" }}>▸</span>
            <span style={{
              ...styles.fileIcon,
              color: fileIconColor(node.name),
            }}>{getFileIcon(node.name)}</span>
            <span style={{
              ...styles.fileName,
              ...(gitStatus ? { color: statusColor(gitStatus) } : {}),
            }}>{node.name}</span>
            {gitStatus && (
              <span style={{
                ...styles.statusBadge,
                color: statusColor(gitStatus),
                background: statusBg(gitStatus),
              }}>
                {statusLabel(gitStatus)}
              </span>
            )}
          </div>
        )}

        {hovered && (
          <div style={styles.actions}>
            <button
              onClick={() => onOpenVSCode(node.path)}
              className="action-btn"
              style={styles.actionBtn}
              title="Open in VS Code"
            >
              VS Code
            </button>
            {!node.isDirectory && isTrackedOnRemote(node.path) && onOpenGitHub && (
              <button
                onClick={() => onOpenGitHub(node.path)}
                className="action-btn"
                style={styles.actionBtn}
                title="Open on GitHub"
              >
                GitHub
              </button>
            )}
          </div>
        )}
      </div>

      {node.expanded && node.children && (
        node.children.map((child) => (
          <TreeItem
            key={child.path}
            node={child}
            depth={depth + 1}
            onToggle={onToggle}
            onOpenVSCode={onOpenVSCode}
            onOpenGitHub={onOpenGitHub}
            getGitStatus={getGitStatus}
            isTrackedOnRemote={isTrackedOnRemote}
          />
        ))
      )}
    </>
  );
}

function getFileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "ts": case "tsx": return "TS";
    case "js": case "jsx": return "JS";
    case "json": return "{}";
    case "md": return "MD";
    case "css": case "scss": case "less": return "CS";
    case "html": return "<>";
    case "py": return "PY";
    case "rs": return "RS";
    case "go": return "GO";
    case "yaml": case "yml": return "YM";
    case "sh": case "bash": case "zsh": return "$_";
    case "png": case "jpg": case "jpeg": case "svg": case "gif": case "webp": return "IM";
    case "toml": return "TM";
    case "lock": return "LK";
    case "env": return "EN";
    case "sql": return "SQ";
    case "graphql": case "gql": return "GQ";
    case "rb": return "RB";
    case "java": return "JV";
    case "swift": return "SW";
    case "kt": return "KT";
    case "c": case "h": return "C_";
    case "cpp": case "cc": case "hpp": return "C+";
    case "xml": return "XM";
    case "csv": return "CV";
    default: return "··";
  }
}

function fileIconColor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "ts": case "tsx": return "#7aa2f7";
    case "js": case "jsx": return "#e0af68";
    case "json": return "#e0af68";
    case "md": return "#7dcfff";
    case "css": case "scss": case "less": return "#bb9af7";
    case "html": return "#f7768e";
    case "py": return "#9ece6a";
    case "rs": return "#ff9e64";
    case "go": return "#7dcfff";
    default: return "var(--text-muted)";
  }
}

function statusColor(status: string): string {
  switch (status) {
    case "M": return "var(--yellow)";
    case "A": return "var(--green)";
    case "D": return "var(--red)";
    case "?": return "var(--text-muted)";
    case "R": return "var(--cyan)";
    default: return "var(--text-muted)";
  }
}

function statusBg(status: string): string {
  switch (status) {
    case "M": return "var(--yellow-dim)";
    case "A": return "var(--green-dim)";
    case "D": return "var(--red-dim)";
    case "?": return "rgba(86, 95, 137, 0.15)";
    case "R": return "rgba(125, 207, 255, 0.1)";
    default: return "rgba(86, 95, 137, 0.15)";
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "M": return "M";
    case "A": return "A";
    case "D": return "D";
    case "?": return "U";
    case "R": return "R";
    default: return status;
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
    background: "var(--bg-secondary)",
  },
  titleBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "5px 12px",
    borderBottom: "1px solid var(--border-subtle)",
    flexShrink: 0,
  },
  title: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    color: "var(--text-muted)",
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: "var(--text-muted)",
    fontSize: 16,
    padding: "0 2px",
    lineHeight: 1,
  },
  body: {
    padding: "4px 0",
    overflowY: "auto",
    flex: 1,
    minHeight: 0,
    fontSize: 12,
    fontFamily: "var(--font-mono)",
  },
  loading: {
    padding: "8px 14px",
    color: "var(--text-muted)",
  },
  item: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 26,
    cursor: "default",
    paddingRight: 8,
  },
  itemBtn: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    background: "none",
    border: "none",
    color: "var(--text-primary)",
    cursor: "pointer",
    padding: 0,
    fontSize: 12,
    fontFamily: "var(--font-mono)",
  },
  fileRow: {
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  arrow: {
    width: 12,
    flexShrink: 0,
    fontSize: 10,
    color: "var(--text-muted)",
    textAlign: "center" as const,
  },
  dirName: {
    color: "var(--accent)",
    fontWeight: 500,
  },
  fileIcon: {
    fontSize: 9,
    fontWeight: 700,
    width: 18,
    textAlign: "center" as const,
    flexShrink: 0,
    letterSpacing: "-0.5px",
  },
  fileName: {
    color: "var(--text-secondary)",
  },
  statusBadge: {
    fontSize: 9,
    fontWeight: 700,
    padding: "0 4px",
    borderRadius: 2,
    marginLeft: 4,
    lineHeight: "14px",
  },
  actions: {
    display: "flex",
    gap: 4,
    flexShrink: 0,
  },
  actionBtn: {
    padding: "1px 6px",
    fontSize: 10,
    background: "var(--bg-primary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    color: "var(--text-muted)",
    whiteSpace: "nowrap" as const,
  },
};
