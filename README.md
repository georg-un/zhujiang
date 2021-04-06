# Yanjing

KWin script to resize and move windows. Like Spectacle/Rectangle on mac.

Available in the [KDE store](https://store.kde.org/p/1492899/)

## Commands 

- Yanjing LEFT - `no default`
    - Vertically maximize, flush the window to the LEFT side of the screen, or
      resize width if already flushed.
- Yanjing CENTER - `no default`
    - Vertically maximize, center window horizontally, or resize width if
      already centered. Centering allows a 2px margin of error.
- Yanjing RIGHT - `no default`
    - Vertically maximize, flush the window to the RIGHT side of the screen,
      or resize width if already flushed.
- Yanjing yMax + LEFT - `ctrl-shift-meta-a`
    - Vertically maximize, flush the window to the LEFT side of the screen, or
      resize width if already flushed.
- Yanjing yMax + CENTER - `ctrl-shift-meta-x` - 
    - Vertically maximize, center window horizontally, or resize width if
      already centered. Centering allows a 2px margin of error.
- Yanjing yMax + RIGHT - `ctrl-shift-meta-d`
    - Vertically maximize, flush the window to the RIGHT side of the screen,
      or resize width if already flushed.

### Resizing logic

The window will steps through the [Sizes array](./contents/code/main.js).
It does so in reverse order, so as you "shove" the window against each edge of
the screen or into the center more, it shrinks. It will loop back to the
largest size.

## License

MIT
