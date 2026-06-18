"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
    X,
    FileText,
    Home,
    Info,
    PenTool,
    RefreshCw,
    Shield,
} from "lucide-react";

import { MobileLink, ToolGroup } from "@/components/MobileComponents";
import CommandSystem from "@/components/CommandSystem";


export default function MobileNav() {

    const [open, setOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [commandOpen, setCommandOpen] = useState(false);

    const startX = useRef(0);
    const currentX = useRef(0);


    /*
        Open animation
    */
    const openSidebar = () => {
        setMounted(true);

        requestAnimationFrame(() => {
            setOpen(true);
        });
    };


    /*
        Close animation
    */
    const closeSidebar = () => {
        setOpen(false);

        setTimeout(() => {
            setMounted(false);
        }, 300);
    };


    /*
        ESC + body lock
    */
    useEffect(() => {

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                closeSidebar();
            }
        };


        if (open) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }


        window.addEventListener(
            "keydown",
            handleEscape
        );


        return () => {
            window.removeEventListener(
                "keydown",
                handleEscape
            );

            document.body.style.overflow = "";
        };


    }, [open]);

    const handleTouchStart = (
        e: React.TouchEvent
    ) => {

        startX.current =
            e.changedTouches[0].clientX;

        currentX.current =
            startX.current;

    };


    const handleTouchMove = (
        e: React.TouchEvent
    ) => {

        currentX.current =
            e.changedTouches[0].clientX;

    };


    const handleTouchEnd = () => {

        const distance =
            currentX.current - startX.current;


        const screenWidth =
            window.innerWidth;


        const startFromLeft =
            startX.current < 40;


        const startFromRight =
            startX.current > screenWidth - 40;

        if (
            !open &&
            (
                (startFromLeft && distance > 80) ||
                (startFromRight && distance < -80)
            )
        ) {
            openSidebar();
            return;
        }

        if (
            open &&
            distance > 80
        ) {
            closeSidebar();
        }

    };



    return (
        <>


            <CommandSystem
                externalOpen={commandOpen}
                onClose={() =>
                    setCommandOpen(false)
                }
            />



            {/* Mobile gesture layer */}
            <div
                className="
        md:hidden
        fixed
        inset-y-0
        left-0
        right-0
        z-40
    "
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            />



            {/* Bottom Navigation */}

            <div
                className="
                md:hidden
                fixed
                bottom-0
                left-0
                right-0
                z-50

                border-t
                border-[color:var(--border)]

                bg-[var(--card)]/90
                backdrop-blur-xl

                flex
                justify-around

                py-3
                "
            >

                <Link
                    href="/"
                    className="text-xs text-center"
                >
                    🏠
                    <div>
                        Home
                    </div>
                </Link>



                <button
                    onClick={() =>
                        setCommandOpen(true)
                    }
                    className="text-xs text-center"
                >
                    🔍
                    <div>
                        Search
                    </div>
                </button>



                <Link
                    href="/tools"
                    className="text-xs text-center"
                >
                    🧰
                    <div>
                        Tools
                    </div>
                </Link>



                <button
                    onClick={openSidebar}
                    className="text-xs text-center"
                >
                    ☰
                    <div>
                        Menu
                    </div>
                </button>


            </div>





            {/* Sidebar */}

            {mounted && (

                <div
                    className={`
                    fixed
                    inset-0
                    z-[300]

                    bg-black/60
                    backdrop-blur-sm

                    transition-opacity
                    duration-300

                    ${
                        open
                            ? "opacity-100"
                            : "opacity-0"
                    }
                    `}
                    onClick={closeSidebar}
                >


                    <aside

                        className={`
                        absolute
                        right-0
                        top-0

                        h-full
                        w-[85%]
                        max-w-sm


                        bg-[var(--card)]

                        border-l
                        border-[color:var(--border)]

                        shadow-2xl

                        p-5

                        overflow-y-auto


                        transition-transform
                        duration-300
                        ease-out


                        ${
                            open
                                ? "translate-x-0"
                                : "translate-x-full"
                        }

                        `}

                        onClick={(e)=>
                            e.stopPropagation()
                        }

                        onTouchStart={
                            handleTouchStart
                        }

                        onTouchMove={
                            handleTouchMove
                        }

                        onTouchEnd={
                            handleTouchEnd
                        }

                    >


                        {/* Header */}

                        <div
                            className="
                            flex
                            justify-between
                            items-center

                            pb-5

                            border-b
                            border-[color:var(--border)]
                            "
                        >

                            <div>

                                <h2
                                    className="
                                    text-xl
                                    font-black

                                    bg-gradient-to-r
                                    from-indigo-500
                                    to-purple-500

                                    bg-clip-text
                                    text-transparent
                                    "
                                >
                                    PDFNest
                                </h2>


                                <p
                                    className="
                                    text-xs
                                    text-[color:var(--muted)]
                                    "
                                >
                                    Free PDF Tools
                                </p>

                            </div>



                            <button
                                onClick={closeSidebar}
                                className="
                                rounded-xl
                                p-2

                                hover:bg-[var(--background)]

                                transition
                                "
                            >

                                <X size={22}/>

                            </button>


                        </div>




                        {/* Navigation */}

                        <div className="mt-5 space-y-1">


                            <MobileLink
                                href="/"
                                icon={<Home size={18}/>}
                                text="Home"
                                close={closeSidebar}
                            />


                            <MobileLink
                                href="/tools"
                                icon={<FileText size={18}/>}
                                text="All Tools"
                                close={closeSidebar}
                            />


                            <MobileLink
                                href="/about"
                                icon={<Info size={18}/>}
                                text="About"
                                close={closeSidebar}
                            />


                        </div>




                        <ToolGroup
                            title="Editing"
                            icon={
                                <PenTool size={16}/>
                            }
                            category="editing"
                            close={closeSidebar}
                        />



                        <ToolGroup
                            title="Convert"
                            icon={
                                <RefreshCw size={16}/>
                            }
                            category="convert"
                            close={closeSidebar}
                        />



                        <ToolGroup
                            title="Security"
                            icon={
                                <Shield size={16}/>
                            }
                            category="security"
                            close={closeSidebar}
                        />


                    </aside>


                </div>

            )}

        </>
    );
}