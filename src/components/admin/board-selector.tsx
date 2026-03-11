type BoardSelectorProps = {
  boardLabel: (boardId: string) => string;
  boardOptions: string[];
  emptyLabel: string;
  hasBoards: boolean;
  selectedBoardIds: string[];
  selectedCountLabel: string;
  title: string;
  onToggle: (boardId: string) => void;
};

export function BoardSelector({
  boardLabel,
  boardOptions,
  emptyLabel,
  hasBoards,
  selectedBoardIds,
  selectedCountLabel,
  title,
  onToggle,
}: BoardSelectorProps) {
  return (
    <div className="admin-board-picker">
      <span>{title}</span>
      {hasBoards ? (
        <>
          <div className="admin-board-grid">
            {boardOptions.map((boardId) => (
              <label key={boardId}>
                <input
                  checked={selectedBoardIds.includes(boardId)}
                  onChange={() => onToggle(boardId)}
                  type="checkbox"
                />
                <span>{boardLabel(boardId)}</span>
              </label>
            ))}
          </div>
          <p className="helper-text">{selectedCountLabel}</p>
        </>
      ) : (
        <p className="helper-text">{emptyLabel}</p>
      )}
    </div>
  );
}