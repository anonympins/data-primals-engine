import React, { useEffect, useState } from "react";
import Button from "./Button.jsx";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {useQueryClient} from "react-query";
import {Trans} from "react-i18next";
import {useModelContext} from "./contexts/ModelContext.jsx";

export const Pagination = ({
  hasPreviousNext,
  visibleItemsCount,
  onRenderItem,
  totalCount,
  onChange,
  page,
  setPage,
  useParam = false,
    showElementsPerPage=false,
    elementsPerPage: propElementsPerPage
}) => {
  const { elementsPerPage: contextElementsPerPage, setElementsPerPage } = useModelContext();
  const elementsPerPage = propElementsPerPage || contextElementsPerPage;
  let pageCount = Math.ceil(totalCount / elementsPerPage);
  const [searchParams, setSearchParams] = useSearchParams();

  const handleFirst = (e) => {
      setPage(1);
      onChange?.(1);
    e.preventDefault();
  };
  const handleLast = (e) => {
      setPage(pageCount);
      onChange?.(pageCount);
    e.preventDefault();
  };
  const handlePrevious = (e) => {
    if (page > 1) {
      setPage(page - 1);
      if (useParam) {
        searchParams.set("page", page - 1 + "");
        setSearchParams(
            (params) => {
              params.set("page", page - 1 + "");
              return params;
            },
            { replace: true },
        );
      }
      onChange?.(page - 1);
    }
    e.preventDefault();
  };
  const handleNext = (e) => {
    if (page < pageCount) {
      setPage(page + 1);
      if (useParam) {
        searchParams.set("page", page + 1 + "");
        setSearchParams(
          (params) => {
            params.set("page", page + 1 + "");
            return params;
          },
          { replace: true },
        );
      }
      onChange?.(page + 1);
    }
    e.preventDefault();
  };

  const handleChange = (p) => {
    if (p !== page) {
      setPage(p);
      if (useParam) {
        searchParams.set("page", p + "");
        setSearchParams(
          (params) => {
            params.set("page", p + "");
            return params;
          },
          { replace: true },
        );
      }
      onChange?.(p);
    }
  };

  const handleElementsPerPageChange = (event) => {
    const newPerPage = parseInt(event.target.value, 10);
    if (!isNaN(newPerPage) && newPerPage > 0 && newPerPage <= 100) {
      setElementsPerPage(newPerPage);
      setPage(1);
      onChange?.(1);
    }
  };
  return (
      <div className="pagination-wrapper flex">
        {page >= 1 && page <= pageCount && (
            <div className="pagination">
              {hasPreviousNext && page > 1 && (
                  <>
                    <Button onClick={handleFirst}>&lt;&lt;</Button>&nbsp;
                  </>
              )}
              {hasPreviousNext && page > 1 && (
                  <>
                    <Button onClick={handlePrevious}>&lt;</Button>&nbsp;
                  </>
              )}
              {Array.from(
                  {length: parseInt(visibleItemsCount, 10)},
                  (_, i) => page + i - parseInt(visibleItemsCount / 2, 10),
              ).map((p, i) => {
                return p >= 1 && p <= pageCount ? (
                    <Button key={"paginate-"+i} disabled={p === page} onClick={() => handleChange(p)}>
                      {p}
                    </Button>
                ) : (
                    <></>
                );
              })}
              {hasPreviousNext && page < pageCount && (
                  <>
                    &nbsp;<Button onClick={handleNext}>&gt;</Button>
                  </>
              )}
              {hasPreviousNext && page < pageCount && (
                  <>
                    &nbsp;<Button onClick={handleLast}>&gt;&gt;</Button>
                  </>
              )}
            </div>
        )}
        {showElementsPerPage&& (<div className="form flex flex-no-wrap elementsPerPage">
          <label htmlFor="elementsPerPage"><Trans i18nKey="pagination.elementsPerPage">Éléments par page:</Trans></label>
          <select id="elementsPerPage" value={elementsPerPage} onChange={handleElementsPerPageChange}>
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="100">100</option>
          </select>
        </div>)}
      </div>
  );
};
