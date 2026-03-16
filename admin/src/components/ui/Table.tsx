import { ReactNode } from 'react';

function Root({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-x-auto rounded-[var(--r6)] border border-[var(--b1)] ${className}`}>
      <table className="w-full text-[var(--fs-2xs)]">{children}</table>
    </div>
  );
}

function Header({ children }: { children: ReactNode }) {
  return (
    <thead className="bg-[var(--s1)] sticky top-0">
      <tr>{children}</tr>
    </thead>
  );
}

function Row({ children, onClick, className = '' }: { children: ReactNode; onClick?: () => void; className?: string }) {
  return (
    <tr
      onClick={onClick}
      className={`
        border-b border-[var(--b0)] transition-colors
        ${onClick ? 'cursor-pointer' : ''}
        hover:bg-[rgba(17,23,32,.5)]
        ${className}
      `}
    >
      {children}
    </tr>
  );
}

function Cell({
  children,
  header,
  align = 'left',
  className = '',
}: {
  children: ReactNode;
  header?: boolean;
  align?: 'left' | 'center' | 'right';
  className?: string;
}) {
  const alignClass = align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left';
  const Tag = header ? 'th' : 'td';

  return (
    <Tag
      className={`
        px-4 py-3
        ${header ? 'text-[var(--fs-3xs)] font-medium text-[var(--t3)] uppercase tracking-wider' : 'text-[var(--t1)]'}
        ${alignClass}
        ${className}
      `}
    >
      {children}
    </Tag>
  );
}

function Empty({ message = 'Tidak ada data.' }: { message?: string }) {
  return (
    <tbody>
      <tr>
        <td colSpan={100} className="px-4 py-12 text-center text-[var(--t3)] text-[var(--fs-2xs)]">
          {message}
        </td>
      </tr>
    </tbody>
  );
}

const Table = { Root, Header, Row, Cell, Empty };
export default Table;
