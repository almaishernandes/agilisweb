import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';

const Combobox = ({
    value, options = [], onChange,
    onAddNew, onEditOption, onDeleteOption,
    onNavigate, placeholder = '', style = {}, inputRef: externalRef
}) => {
    const [open, setOpen]               = useState(false);
    const [input, setInput]             = useState(value || '');
    const [userTyped, setUserTyped]     = useState(false);
    const [highlighted, setHighlighted] = useState(-1);
    const [rect, setRect]               = useState(null);
    const internalRef = useRef(null);
    const inputEl     = externalRef || internalRef;

    useEffect(() => {
        setTimeout(() => {
            if (inputEl.current) {
                const r = inputEl.current.getBoundingClientRect();
                setRect({ top: r.top, left: r.left, width: r.width, bottom: r.bottom, right: r.right });
                if (!value) setInput('');
                setOpen(true);
            }
        }, 0);
    }, []);

    // Filtra: quando o usuário digitou algo filtra; caso contrário mostra tudo
    const filtered = (userTyped && input.length >= 1)
        ? options.filter(o => o.toLowerCase().includes(input.toLowerCase()))
        : options;

    const showAddNew = !!(input.trim().length >= 2
        && !options.some(o => o.toLowerCase() === input.trim().toLowerCase())
        && onAddNew);

    const updateRect = () => {
        if (!inputEl.current) return;
        const r = inputEl.current.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, bottom: r.bottom, right: r.right });
    };

    const handleSelect = (opt) => {
        setInput(opt);
        setUserTyped(false);
        onChange(opt);
        setOpen(false);
        if (onNavigate) onNavigate('next');
    };

    const handleAddNew = async () => {
        const val = input.trim();
        if (!val) return;
        await onAddNew(val);
        onChange(val);
        setOpen(false);
        if (onNavigate) onNavigate('next');
    };

    const handleBlur = () => {
        setTimeout(() => {
            setInput('');
            setOpen(false);
        }, 200);
    };

    const handleKeyDown = (e) => {
        const total = filtered.length + (showAddNew ? 1 : 0);
        if (e.key === 'ArrowDown') {
            e.preventDefault(); setHighlighted(h => Math.min(h + 1, total - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault(); setHighlighted(h => Math.max(h - 1, -1));
        } else if (e.key === 'Enter') {
            e.preventDefault(); e.stopPropagation();
            if (highlighted >= 0 && highlighted < filtered.length) handleSelect(filtered[highlighted]);
            else if (highlighted === filtered.length && showAddNew) handleAddNew();
            else if (filtered.length === 1) handleSelect(filtered[0]);
            else if (showAddNew) handleAddNew();
            else {
                const exact = options.find(o => o.toLowerCase() === input.trim().toLowerCase());
                if (exact) handleSelect(exact);
                else { setOpen(false); if (onNavigate) onNavigate('next'); }
            }
        } else if (e.key === 'Tab') {
            e.preventDefault(); e.stopPropagation();
            setOpen(false);
            if (onNavigate) onNavigate(e.shiftKey ? 'back' : 'next');
        } else if (e.key === 'Escape') {
            setInput(value || ''); setOpen(false);
        }
    };

    const dropdown = (open && rect && (filtered.length > 0 || showAddNew))
        ? ReactDOM.createPortal(
            <div
                onMouseDown={e => e.preventDefault()}
                style={{
                    position: 'fixed',
                    top: Math.round(window.innerHeight / 2),
                    transform: 'translateY(-50%)',
                    left: rect.right + 4,
                    minWidth: '220px',
                    maxWidth: '380px',
                    zIndex: 999999,
                    background: '#fff',
                    border: '1px solid #b2dfdb',
                    borderRadius: '6px',
                    boxShadow: '0 6px 20px rgba(0,0,0,0.18)',
                    maxHeight: '260px',
                    overflowY: 'auto',
                    fontFamily: 'inherit',
                }}
            >
                {filtered.map((opt, i) => (
                    <div
                        key={opt}
                        onMouseDown={() => handleSelect(opt)}
                        onMouseEnter={() => setHighlighted(i)}
                        style={{
                            padding: '6px 12px',
                            fontSize: '12px',
                            cursor: 'pointer',
                            background: highlighted === i ? '#e0f2f1' : '#fff',
                            borderBottom: '1px solid #f3f3f3',
                            color: '#111',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {opt}
                    </div>
                ))}

                {showAddNew && (
                    <div
                        onMouseDown={handleAddNew}
                        onMouseEnter={() => setHighlighted(filtered.length)}
                        style={{
                            padding: '7px 12px',
                            fontSize: '11px',
                            cursor: 'pointer',
                            background: highlighted === filtered.length ? '#fff3e0' : '#fffde7',
                            color: '#e65100',
                            fontWeight: '700',
                            borderTop: '1px solid #e0e0e0',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        ➕ Adicionar "{input.trim()}"
                    </div>
                )}
            </div>,
            document.body
        )
        : null;

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <input
                ref={inputEl}
                className="spreadsheet-input combobox-input"
                type="text"
                value={input}
                placeholder={placeholder}
                style={{ fontSize: '13px', fontWeight: '700', height: '32px', padding: '0 8px', ...style }}
                autoFocus
                onChange={e => { setInput(e.target.value); setUserTyped(true); updateRect(); setOpen(true); setHighlighted(-1); }}
                onFocus={() => { updateRect(); setOpen(true); }}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
            />
            {dropdown}
        </div>
    );
};

export default Combobox;
